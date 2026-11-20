import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskLocator } from '../../../../services/task/task-locator.service.js';
import type { ResolveIntakeContactTaskInput } from './resolve-intake-contact-task.input.js';
import type { ResolveIntakeContactTaskOutput } from './resolve-intake-contact-task.output.js';

/** Resolves a task only when the current member can edit its current list. */
export class ResolveIntakeContactTask {
  // #region Properties
  /** Resolves membership and task placement in the same snapshot. */
  private readonly viewers: ViewerResolver;
  private readonly locator: TaskLocator;
  // #endregion

  // #region Constructor
  /** Binds the task transaction and access directories. */
  public constructor(
    private readonly work: TasksUnitOfWork,
    members: MemberDirectory,
    spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
    this.locator = new TaskLocator(spaces);
  }
  // #endregion

  // #region Methods
  /** Checks the task before the caller reads its separate contact. */
  public async execute(
    input: ResolveIntakeContactTaskInput,
  ): Promise<ResolveIntakeContactTaskOutput> {
    try {
      return await this.work.runReadOnly(
        async (store): Promise<ResolveIntakeContactTaskOutput> => {
          const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
          const located = await this.locator.locate(store, {
            organizationId: input.organizationId,
            viewer,
            taskKey: input.taskKey,
            edit: true,
            lock: false,
            archived: 'allow',
            expectedVersions: null,
          });
          return { outcome: 'found', taskId: located.task.snapshot.id };
        },
        { snapshot: true },
      );
    } catch (error: unknown) {
      if (error instanceof TaskRefusal) {
        const refusal = error.refusal;
        if (refusal.reason === 'task-trashed') {
          return { outcome: 'task-trashed', details: TaskRefusal.trashDetails(refusal) };
        }
        if (refusal.reason === 'task-not-found' || refusal.reason === 'organization-not-found') {
          return { outcome: refusal.reason };
        }
        if (
          refusal.reason === 'role-insufficient' &&
          (refusal.role === 'view' || refusal.role === 'comment')
        ) {
          return { outcome: 'role-insufficient', role: refusal.role };
        }
      }
      throw error;
    }
  }
  // #endregion
}
