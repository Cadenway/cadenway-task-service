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
import { TaskViewBuilder } from '../../../../services/task/task-view-builder.service.js';
import type { RemoveTaskLabelInput } from './remove-task-label.input.js';
import type { RemoveTaskLabelOutput } from './remove-task-label.output.js';

/**
 * Class RemoveTaskLabel
 *
 * @description
 * Removes a label from a task the actor sees (`POST /internal/v1/tasks/{taskKey}/labels/remove`).
 * A label the task does not have, compared ignoring case, changes nothing (`Task.removeLabel`). A
 * change writes the task and appends `task.updated.v1` (`changed: ['labels']`).
 */
export class RemoveTaskLabel {
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
   * Removes the label.
   *
   * @param {RemoveTaskLabelInput} input - The actor, the task, the label and the versions
   * `If-Match` accepts.
   * @returns {Promise<RemoveTaskLabelOutput>} The task after the change.
   * @throws {TaskRefusal} `organization-not-found`, `task-not-found` or `version-mismatch`.
   */
  public async execute(input: RemoveTaskLabelInput): Promise<RemoveTaskLabelOutput> {
    return this.unitOfWork.run(async (store: TasksStore): Promise<RemoveTaskLabelOutput> => {
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
        task.removeLabel(input.name, now),
      );
      await this.writer.commit(store, task, update, input.actorUserId, now);
      return this.views.build(store.reader, update.task);
    });
  }
  // #endregion
}
