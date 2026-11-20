import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { TaskTemplateScopeInput } from '../../../../models/space/task-template-scope-input.model.js';
import type { TaskTemplateScope } from '../../../../models/space/task-template-scope.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';

/** Resolves library access and holds the live space and source list for a template write. */
export class ResolveTaskTemplateSpace {
  // #region Properties
  /** Resolves the projected membership. */
  private readonly viewers: ViewerResolver;

  /** Applies the current space and list grants. */
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Uses the space owner and membership projection in the caller's tenant transaction. */
  public constructor(
    private readonly unitOfWork: SpacesUnitOfWork,
    members: MemberDirectory,
  ) {
    this.viewers = new ViewerResolver(members);
  }
  // #endregion

  // #region Methods
  /**
   * Preparation holds only membership. Writes then lock the space after the source task and
   * before the source list. Taking an exclusive space lock also serializes the library's limit.
   */
  public async execute(input: TaskTemplateScopeInput): Promise<TaskTemplateScope> {
    const { organizationId, actorUserId, spaceId, mode, listId } = input;
    try {
      return await this.unitOfWork.run(async (store): Promise<TaskTemplateScope> => {
        const viewer: Viewer = await this.viewers.resolve(
          organizationId,
          actorUserId,
          mode !== 'read',
        );
        const space: Space | null =
          mode === 'write'
            ? await store.spaces.lock(organizationId, spaceId)
            : await store.spaces.find(organizationId, spaceId);
        if (space === null) {
          return { outcome: 'space-not-found' };
        }
        const list: TaskList | null =
          mode === 'write' && listId !== undefined
            ? await store.lists.lockShared(organizationId, listId)
            : null;
        const sourceList = list?.snapshot.spaceId === spaceId ? list.snapshot : null;
        const roles = await this.access.resolve(store.grants, viewer, space.snapshot, sourceList);
        if (roles.spaceRole === null) {
          return { outcome: 'space-not-found' };
        }
        return {
          outcome: 'found',
          spaceRole: roles.spaceRole,
          listRole: roles.listRole,
          sourceRestricted:
            space.snapshot.visibility === 'organization' &&
            sourceList?.organizationAccess === false,
        };
      });
    } catch (error: unknown) {
      if (error instanceof SpaceRefusal && error.refusal.reason === 'organization-not-found') {
        return { outcome: 'organization-not-found' };
      }
      throw error;
    }
  }
  // #endregion
}
