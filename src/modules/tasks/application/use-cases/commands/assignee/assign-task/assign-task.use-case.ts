import type { AssigneeCandidate } from '../../../../../domain/value-objects/member/assignee-candidate.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { AssigneeChecker } from '../../../../services/member/assignee-checker.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { AssignTaskInput } from './assign-task.input.js';
import type { AssignTaskOutput } from './assign-task.output.js';

/**
 * Class AssignTask
 *
 * @description
 * Assigns an account to a task the actor sees
 * (`PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`). Locks follow the order of the module:
 * the membership of the actor, the membership of the account assigned (`FOR SHARE`, so that a
 * concurrent removal waits and then sees the assignment, or this write sees the removal), then the
 * task. The domain decides: an account already assigned changes nothing (checked before its
 * membership), a guest or an unknown account is `assignee-invalid`, the 21st is
 * `assignee-limit-reached` (`Task.assign`). A change writes the task, records an `assign` entry
 * (`added: true`) and appends `task.updated.v1` then `task.assigned.v1`.
 */
export class AssignTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Reads and locks the membership of the account assigned. */
  private readonly assignees: AssigneeChecker;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the change. */
  private readonly writer: TaskChangeWriter;

  /** Builds the view of the task. */
  private readonly views: TaskViewBuilder;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the two directories.
   *
   * @param {TasksUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @param {SpaceDirectory} spaces - The spaces module.
   * @constructor
   */
  public constructor(
    unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.unitOfWork = unitOfWork;
    this.viewers = new ViewerResolver(members);
    this.assignees = new AssigneeChecker(members);
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
    this.writer = new TaskChangeWriter();
    this.views = new TaskViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Assigns the account.
   *
   * @param {AssignTaskInput} input - The actor, the task, the account and the versions `If-Match`
   * accepts.
   * @returns {Promise<AssignTaskOutput>} The task after the assignment.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found`, `version-mismatch`,
   * `assignee-invalid` or `assignee-limit-reached`.
   */
  public async execute(input: AssignTaskInput): Promise<AssignTaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<AssignTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const [candidate]: readonly AssigneeCandidate[] = await this.assignees.candidates(
        input.organizationId,
        [input.userId],
        true,
      );
      const { task }: LocatedTask = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        lock: true,
        expectedVersions: input.expectedVersions,
      });
      const now: Date = await store.clock.now();
      const update: TaskUpdate = this.rules.apply((): TaskUpdate => {
        if (candidate === undefined) {
          throw new Error(
            `The candidate ${input.userId} of the assignment to ${input.taskKey} is missing.`,
          );
        }
        return task.assign(candidate, now);
      });
      await this.writer.commit(store, task, update, input.actorUserId, now);
      return this.views.build(store.reader, update.task);
    });
  }
  // #endregion
}
