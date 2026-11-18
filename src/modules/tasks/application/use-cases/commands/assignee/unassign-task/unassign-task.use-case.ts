import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskUpdate } from '../../../../../domain/value-objects/task/task-update.value-object.js';
import type { LocatedTask } from '../../../../models/task/located-task.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskChangeWriter } from '../../../../services/task/task-change-writer.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { UnassignTaskInput } from './unassign-task.input.js';
import type { UnassignTaskOutput } from './unassign-task.output.js';

/**
 * Class UnassignTask
 *
 * @description
 * Removes an account from the assignees of a task the actor sees
 * (`DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`). An account that is not assigned
 * changes nothing and the current version is answered. A change writes the task, records an
 * `assign` entry (`added: false`) and appends `task.updated.v1` (never `task.assigned.v1`). The
 * account removed need not be a member any more.
 */
export class UnassignTask {
  // #region Properties
  /** The tenant transaction of the use case. */
  private readonly unitOfWork: TasksUnitOfWork;

  /** Resolves the acting member. */
  private readonly viewers: ViewerResolver;

  /** Finds the task. */
  private readonly locator: TaskLocator;

  /** Maps the refusals of the domain. */
  private readonly rules: TaskRuleGuard;

  /** Writes the change. */
  private readonly writer: TaskChangeWriter;
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
    this.locator = new TaskLocator(spaces);
    this.rules = new TaskRuleGuard();
    this.writer = new TaskChangeWriter();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Removes the account.
   *
   * @param {UnassignTaskInput} input - The actor, the task, the account and the versions `If-Match`
   * accepts.
   * @returns {Promise<UnassignTaskOutput>} The version of the task after the removal.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found` or `version-mismatch`.
   */
  public async execute(input: UnassignTaskInput): Promise<UnassignTaskOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<UnassignTaskOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
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
      const update: TaskUpdate = this.rules.apply((): TaskUpdate =>
        task.unassign(input.userId, now),
      );
      await this.writer.commit(store, task, update, input.actorUserId, now);
      return { version: update.task.snapshot.version };
    });
  }
  // #endregion
}
