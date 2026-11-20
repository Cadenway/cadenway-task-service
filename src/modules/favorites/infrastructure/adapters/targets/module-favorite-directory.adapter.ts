import type { FindOrganizationMember } from '../../../../organization-members/public/membership/find-organization-member.js';
import type { FindFavoriteSavedView } from '../../../../saved-views/public/view/find-favorite-saved-view.js';
import type { FindVisibleList } from '../../../../spaces/public/list/find-visible-list.js';
import type { FindVisibleLists } from '../../../../spaces/public/list/find-visible-lists.js';
import type { LockTrashLists } from '../../../../spaces/public/list/lock-trash-lists.js';
import type { FindFavoriteSpaces } from '../../../../spaces/public/space/find-favorite-spaces.js';
import type { FavoriteMemberRole } from '../../../application/models/collection/favorite-member-role.model.js';
import type { FavoriteOwner } from '../../../application/models/collection/favorite-owner.model.js';
import type { FavoriteTarget } from '../../../application/models/target/favorite-target.model.js';
import type { FavoriteDirectory } from '../../../application/ports/outbound/targets/favorite/favorite-directory.port.js';
import type { VisibleFavorite } from '../../../application/projections/favorite/visible-favorite.projection.js';
import { favoriteTargetKey } from '../../../domain/value-objects/target/favorite-target-key.value-object.js';

/** Maximum number of list IDs accepted by the Spaces provider in a single read. */
const LIST_LOOKUP_LIMIT = 100;

/** Loads current visibility and holds placements through the APIs of the owning modules. */
export class ModuleFavoriteDirectory implements FavoriteDirectory {
  // #region Constructor
  /** Binds membership, Spaces and SavedViews lookups to the caller's tenant transaction. */
  public constructor(
    private readonly membership: FindOrganizationMember,
    private readonly findSpaces: FindFavoriteSpaces,
    private readonly findList: FindVisibleList,
    private readonly findLists: FindVisibleLists,
    private readonly holdLists: LockTrashLists,
    private readonly findSavedView: FindFavoriteSavedView,
  ) {}
  // #endregion

  // #region Methods
  /** Trusts the membership projection for the organization role. */
  public async member(owner: FavoriteOwner, lock: boolean): Promise<FavoriteMemberRole | null> {
    const member = await this.membership.execute({
      organizationId: owner.organizationId,
      userId: owner.actorUserId,
      lock,
    });
    return member?.role ?? null;
  }

  /** Resolves each kind in bounded batches and skips all inactive targets. */
  public async visible(
    owner: FavoriteOwner,
    role: FavoriteMemberRole,
    targets: readonly FavoriteTarget[],
  ): Promise<ReadonlyMap<string, VisibleFavorite['target']>> {
    const result = new Map<string, VisibleFavorite['target']>();
    const viewer = {
      organizationId: owner.organizationId,
      viewerUserId: owner.actorUserId,
      viewerRole: role,
    };
    const spaceIds: string[] = [];
    const listIds: string[] = [];
    const viewIds: string[] = [];
    for (const target of targets) {
      switch (target.kind) {
        case 'space':
          spaceIds.push(target.targetId);
          break;
        case 'list':
          listIds.push(target.targetId);
          break;
        case 'saved-view':
          viewIds.push(target.targetId);
          break;
      }
    }

    if (spaceIds.length > 0) {
      for (const space of await this.findSpaces.execute({ ...viewer, spaceIds })) {
        result.set(favoriteTargetKey({ kind: 'space', targetId: space.id }), { name: space.name });
      }
    }
    for (let index = 0; index < listIds.length; index += LIST_LOOKUP_LIMIT) {
      const batch = await this.findLists.execute({
        ...viewer,
        listIds: listIds.slice(index, index + LIST_LOOKUP_LIMIT),
      });
      for (const list of batch.lists) {
        if (list.archivedAt === null) {
          result.set(favoriteTargetKey({ kind: 'list', targetId: list.id }), { name: list.name });
        }
      }
    }
    if (viewIds.length > 0) {
      for (const view of await this.findSavedView.executeMany({ ...owner, viewIds })) {
        result.set(favoriteTargetKey({ kind: 'saved-view', targetId: view.id }), {
          name: view.name,
          listId: view.listId,
        });
      }
    }
    return result;
  }

  /** Holds the active resource under the parent mutation lock order before returning its name. */
  public async hold(
    owner: FavoriteOwner,
    role: FavoriteMemberRole,
    target: FavoriteTarget,
  ): Promise<VisibleFavorite['target'] | null> {
    const viewer = {
      organizationId: owner.organizationId,
      viewerUserId: owner.actorUserId,
      viewerRole: role,
    };
    switch (target.kind) {
      case 'space': {
        const [space] = await this.findSpaces.execute({
          ...viewer,
          spaceIds: [target.targetId],
          lock: true,
        });
        return space === undefined ? null : { name: space.name };
      }
      case 'list': {
        const list = { ...viewer, listId: target.targetId };
        const eligible = await this.findList.execute(list);
        if (eligible?.list.archivedAt !== null) {
          return null;
        }
        await this.holdLists.execute({
          organizationId: owner.organizationId,
          listIds: [target.targetId],
          mode: 'hold',
          viewer: null,
        });
        const visible = await this.findList.execute(list);
        return visible?.list.archivedAt === null ? { name: visible.list.name } : null;
      }
      case 'saved-view': {
        const view = await this.findSavedView.execute({
          ...owner,
          viewId: target.targetId,
          lock: true,
        });
        return view === null ? null : { name: view.name, listId: view.listId };
      }
    }
  }
  // #endregion
}
