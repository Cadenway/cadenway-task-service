import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { DependencyActor } from '../../models/dependency/dependency-actor.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../member/viewer-resolver.service.js';
import { TaskLocator } from '../task/task-locator.service.js';

/** Resolves both anchor access and list scope in one repeatable snapshot. */
export class TaskDependencyReads {
  // #region Properties
  /** Resolves the actor from the current membership snapshot. */
  private readonly viewers: ViewerResolver;

  /** Applies the common task read and edit rules. */
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /**
   * @param unitOfWork - Snapshot transaction owner.
   * @param members - Copy of the memberships.
   * @param spaces - Current task placements and effective list roles.
   */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Runs a dependency query for one authorized anchor.
   *
   * @param input - The actor and anchor key.
   * @param edit - Requires edit on anchor and candidates when true.
   * @param query - The query using the anchor and scoped list ids.
   * @returns The scoped result from the transaction's snapshot.
   */
  public async run<TResult>(
    input: DependencyActor,
    edit: boolean,
    query: (store: TasksStore, anchor: Task, listIds: readonly string[]) => Promise<TResult>,
  ): Promise<TResult> {
    return this.unitOfWork.runReadOnly(
      async (store: TasksStore): Promise<TResult> => {
        const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        const { task } = await this.locator.locate(store, {
          organizationId: input.organizationId,
          viewer,
          taskKey: input.taskKey,
          edit,
          lock: false,
          archived: 'allow',
          expectedVersions: null,
        });
        const listIds: readonly string[] = await this.spaces.visibleListIds(
          input.organizationId,
          viewer,
          edit,
        );
        return query(store, task, listIds);
      },
      { snapshot: true },
    );
  }
  // #endregion
}
