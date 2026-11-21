import { refuseUnassignable } from '../../../../../domain/policies/task/assignability.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskMovePlanner } from '../../../../services/task/task-move-planner.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { ApplyAutomationTaskActionInput } from './apply-automation-task-action.input.js';
import type { ApplyAutomationTaskActionOutput } from './apply-automation-task-action.output.js';

/** Applies a rule action under its author's current membership and task edit authority. */
export class ApplyAutomationTaskAction {
  // #region Properties
  /** Resolves the author and target against their current tenant membership. */
  private readonly viewers: ViewerResolver;
  private readonly assignees: AssigneeChecker;
  private readonly locator: TaskLocator;
  private readonly placement: TaskMovePlanner;
  private readonly rules = new TaskRuleGuard();
  private readonly writer = new TaskChangeWriter();
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and its membership and placement authorities. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.assignees = new AssigneeChecker(members);
    this.locator = new TaskLocator(spaces);
    this.placement = new TaskMovePlanner(spaces);
  }
  // #endregion

  // #region Methods
  /** Rechecks the author's current task access before an idempotent receipt can be replayed. */
  public async authorize(input: ApplyAutomationTaskActionInput): Promise<void> {
    await this.work.run(async (store) => {
      const viewer = await this.viewers.resolve(input.organizationId, input.ruleAuthorUserId, true);
      const candidates =
        input.action.type === 'assign'
          ? await this.assignees.candidates(input.organizationId, [input.action.userId], true)
          : [];
      await this.locate(store, viewer, input);
      this.rules.apply(() => {
        refuseUnassignable(candidates);
      });
    });
  }

  /** Applies the domain action and writes its activity and events in the same tenant transaction. */
  public async execute(
    input: ApplyAutomationTaskActionInput,
  ): Promise<ApplyAutomationTaskActionOutput> {
    return this.work.run(async (store) => {
      const viewer = await this.viewers.resolve(input.organizationId, input.ruleAuthorUserId, true);
      const [candidate] =
        input.action.type === 'assign'
          ? await this.assignees.candidates(input.organizationId, [input.action.userId], true)
          : [];
      const { task, placement } = await this.locate(store, viewer, input);
      const now = await store.clock.now();
      const update: TaskUpdate = this.rules.apply(() => {
        if (input.action.type === 'priority') {
          return task.update({ priority: input.action.priority }, placement.space.statuses, now);
        }
        if (candidate === undefined) throw new Error('The assignment candidate is missing.');
        refuseUnassignable([candidate]);
        return task.assign(candidate, now);
      });
      await this.writer.commitAs(
        store,
        task,
        update,
        { type: 'automation', id: input.ruleId },
        now,
      );
      return { disposition: update.changed.length === 0 ? 'no_op' : 'applied' };
    });
  }

  /** Holds the task and its live list while rechecking the author's effective edit role. */
  private async locate(
    store: TasksStore,
    viewer: Viewer,
    input: ApplyAutomationTaskActionInput,
  ): Promise<LocatedTask> {
    const located = await this.locator.locate(store, {
      organizationId: input.organizationId,
      viewer,
      taskKey: input.taskKey,
      edit: true,
      lock: true,
      archived: 'refuse',
      expectedVersions: null,
    });
    await this.placement.holdPlacement(input.organizationId, viewer, located.task.snapshot.listId);
    const placement = await this.spaces.findVisibleList(
      input.organizationId,
      viewer,
      located.task.snapshot.listId,
    );
    if (
      placement?.list.archivedAt !== null ||
      placement.space.id !== located.task.snapshot.spaceId
    ) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return { task: located.task, placement };
  }
  // #endregion
}
