import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../../../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ResolveCommentTaskInput } from './resolve-comment-task.input.js';
import type { ResolveCommentTaskOutput } from './resolve-comment-task.output.js';

/** Resolves a task with the same visibility and trash rules as its ordinary detail. */
export class ResolveCommentTask {
  // #region Properties
  /** Joins the comment transaction. */
  private readonly unit: TasksUnitOfWork;

  /** Resolves the viewer within the task's tenant. */
  private readonly viewers: ViewerResolver;

  /** Applies the task module's visibility and trash rules. */
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and the task-access directories. */
  public constructor(unit: TasksUnitOfWork, members: MemberDirectory, spaces: SpaceDirectory) {
    this.unit = unit;
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Returns the task ID, or the authorized trash refusal, before looking up a comment. */
  public async execute(input: ResolveCommentTaskInput): Promise<ResolveCommentTaskOutput> {
    const work = async (store: TasksStore): Promise<ResolveCommentTaskOutput> => {
      const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const located = await this.locator.locate(store, {
        organizationId: input.organizationId,
        viewer,
        taskKey: input.taskKey,
        edit: false,
        lock: false,
        archived: 'allow',
        expectedVersions: null,
      });
      return { outcome: 'found', taskId: located.task.snapshot.id };
    };

    try {
      return await (input.joinWrite === true ? this.unit.run(work) : this.unit.runReadOnly(work));
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        const refusal = error.refusal;
        if (refusal.reason === 'task-trashed') {
          return { outcome: 'task-trashed', details: TaskRefusal.trashDetails(refusal) };
        }
        if (refusal.reason === 'task-not-found' || refusal.reason === 'organization-not-found') {
          return { outcome: refusal.reason };
        }
      }
      throw error;
    }
  }
  // #endregion
}
