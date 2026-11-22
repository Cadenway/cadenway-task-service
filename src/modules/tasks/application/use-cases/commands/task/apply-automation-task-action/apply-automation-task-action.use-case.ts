import { refuseUnassignable } from '../../../../../domain/policies/task/assignability.policy.js';
import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { DelegatedMembershipProof } from '../../../../models/membership/delegated-membership-proof.model.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { DelegatedMemberships } from '../../../queries/member/delegated-memberships/delegated-memberships.use-case.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { ApplyAutomationTaskActionInput } from './apply-automation-task-action.input.js';
import type { ApplyAutomationTaskActionOutput } from './apply-automation-task-action.output.js';

/** Applies a rule action under its author's current membership and task edit authority. */
export class ApplyAutomationTaskAction {
  // #region Properties
  /** Finds the task at its authorized placement. */
  private readonly locator: TaskLocator;

  /** Translates the ordinary task domain refusals. */
  private readonly rules = new TaskRuleGuard();

  /** Writes activity and events alongside the state change. */
  private readonly writer = new TaskChangeWriter();
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and its membership and placement authorities. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    spaces: SpaceDirectory,
    private readonly memberships: DelegatedMemberships,
  ) {
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Rechecks the author's current task access before an idempotent receipt can be replayed. */
  public async authorize(input: ApplyAutomationTaskActionInput): Promise<DelegatedMembershipProof> {
    const proof = await this.readMemberships(input);
    await this.work.run(async (store) => {
      const { viewer, candidate } = await this.checkMemberships(input, proof);
      await this.locate(store, viewer, input);
      this.rules.apply(() => {
        if (candidate !== undefined) refuseUnassignable([candidate]);
      });
    });
    return proof;
  }

  /** Applies the domain action and writes its activity and events in the same tenant transaction. */
  public async execute(
    input: ApplyAutomationTaskActionInput,
    proof?: DelegatedMembershipProof,
  ): Promise<ApplyAutomationTaskActionOutput> {
    const current = proof ?? (await this.readMemberships(input));
    return this.work.run(async (store) => {
      const { viewer, candidate } = await this.checkMemberships(input, current);
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

  /** Queries the owner of the memberships before acquiring Task locks. */
  private readMemberships(
    input: ApplyAutomationTaskActionInput,
  ): Promise<DelegatedMembershipProof> {
    const users = [input.ruleAuthorUserId];
    if (input.action.type === 'assign') users.push(input.action.userId);
    return this.memberships.execute(input.organizationId, users);
  }

  /** Holds the projections checked by Organization while the task decision is made. */
  private async checkMemberships(
    input: ApplyAutomationTaskActionInput,
    proof: DelegatedMembershipProof,
  ): Promise<{ readonly viewer: Viewer; readonly candidate?: AssigneeCandidate }> {
    const viewer = await this.memberships.require(
      proof,
      input.organizationId,
      input.ruleAuthorUserId,
      true,
    );
    if (input.action.type !== 'assign') return { viewer };
    const { userId } = input.action;
    const assignee = await this.memberships.confirm(proof, input.organizationId, userId, true);
    return { viewer, candidate: { userId, role: assignee?.role ?? null } };
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
    if (
      located.placement.list.archivedAt !== null ||
      located.placement.space.id !== located.task.snapshot.spaceId
    ) {
      throw new TaskRefusal({ reason: 'task-not-found' });
    }
    return located;
  }
  // #endregion
}
