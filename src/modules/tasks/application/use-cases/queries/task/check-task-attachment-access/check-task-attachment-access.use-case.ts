import { InvalidTaskError } from '../../../../../domain/errors/task/invalid-task.error.js';
import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { TaskEditGuard } from '../../../../services/task/task-edit-guard.service.js';
import { TaskRuleGuard } from '../../../../services/task/task-rule-guard.service.js';
import type { CheckTaskAttachmentAccessInput } from './check-task-attachment-access.input.js';
import type { CheckTaskAttachmentAccessOutput } from './check-task-attachment-access.output.js';

/** Authorizes one attachment request against the current task placement and list role. */
export class CheckTaskAttachmentAccess {
  // #region Properties
  /** Resolves the caller against the membership projection. */
  private readonly viewers: ViewerResolver;

  /** Applies the list role policy. */
  private readonly editing = new TaskEditGuard();

  /** Maps domain rule refusals. */
  private readonly rules = new TaskRuleGuard();
  // #endregion

  // #region Constructor
  /** Binds the tenant transaction and directories used by the decision. */
  public constructor(
    private readonly unitOfWork: TasksUnitOfWork,
    members: MemberDirectory,
    private readonly spaces: SpaceDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /** Reads membership, task, placement and archive state in the same snapshot. */
  public execute(input: CheckTaskAttachmentAccessInput): Promise<CheckTaskAttachmentAccessOutput> {
    return this.unitOfWork.runReadOnly(
      async (store) => {
        const viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
        let key: TaskKey;
        try {
          key = TaskKey.parse(input.taskKey);
        } catch (error: unknown) {
          if (error instanceof InvalidTaskError)
            throw new TaskRefusal({ reason: 'task-not-found' });
          throw error;
        }
        const location = await store.reader.attachmentLocationByKey(input.organizationId, key);
        const placement =
          location === null
            ? null
            : await this.spaces.findVisibleList(input.organizationId, viewer, location.listId);
        if (location === null || placement === null) {
          throw new TaskRefusal({ reason: 'task-not-found' });
        }
        if (input.mode === 'write') {
          this.editing.requireEdit(placement.list);
          if (location.archived) {
            const task = await store.tasks.findByKey(input.organizationId, key, false);
            if (task === null) throw new TaskRefusal({ reason: 'task-not-found' });
            this.rules.apply(() => {
              task.requireChangeable();
            });
          }
          if (placement.list.archivedAt !== null) {
            throw new TaskRefusal({ reason: 'task-archived', key: location.key });
          }
        }
        return undefined;
      },
      { snapshot: true },
    );
  }
  // #endregion
}
