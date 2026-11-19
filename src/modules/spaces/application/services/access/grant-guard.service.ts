import { canManageListAccess } from '../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { AccessResolver } from './access-resolver.service.js';

/**
 * Class GrantGuard
 *
 * @description
 * Locks the space or the list whose grants change, in the lock order of the module (memberships,
 * then the space, then the list), and checks that the actor may change them, in the refusal order
 * of `openapi/internal/task-service.yaml`: unknown or not seen `404`, then `403`, then `If-Match`
 * `412`; the rules of the grant come after, in the domain. The grants of a space are changed by
 * the people who manage it (`space.manage-forbidden`), those of a list by whoever has `edit` on it
 * (`access.role-insufficient`). A change of the grants of a list locks its space `FOR SHARE`
 * first: the owner of the space, whom no grant may name, cannot change meanwhile.
 */
export class GrantGuard {
  // #region Properties
  /**
   * Property access
   *
   * @description
   * Decides what the actor reaches.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the guard.
   *
   * @constructor
   */
  public constructor() {
    this.access = new AccessResolver();
  }
  // #endregion

  // #region Methods
  /**
   * Method lockManagedSpace
   *
   * @description
   * Locks a space `FOR NO KEY UPDATE` and checks that the actor manages it.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The actor, whose membership the caller locked first.
   * @param {string} spaceId - The space.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` accepts, or `null`.
   * @returns {Promise<Space>} The locked space.
   * @throws {SpaceRefusal} `space-not-found`, `manage-forbidden` or `version-mismatch`.
   */
  public async lockManagedSpace(
    store: SpacesStore,
    organizationId: string,
    viewer: Viewer,
    spaceId: string,
    expectedVersions: readonly number[] | null,
  ): Promise<Space> {
    const space: Space | null = await store.spaces.lock(organizationId, spaceId);
    if (space === null) {
      throw new SpaceRefusal({ reason: 'space-not-found' });
    }
    const access: ViewerAccess = await this.access.resolve(
      store.grants,
      viewer,
      space.snapshot,
      null,
    );
    if (!access.seesSpace) {
      throw new SpaceRefusal({ reason: 'space-not-found' });
    }
    if (!access.canManage) {
      throw new SpaceRefusal({ reason: 'manage-forbidden' });
    }
    this.checkVersion(space.snapshot.version, expectedVersions);
    return space;
  }

  /**
   * Method lockEditableList
   *
   * @description
   * Locks a list, after its space `FOR SHARE`, and checks that the actor has `edit` on it.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The actor, whose membership the caller locked first.
   * @param {string} listId - The list.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` accepts, or `null`.
   * @returns {Promise<{ readonly space: Space; readonly list: TaskList }>} The space and the list.
   * @throws {SpaceRefusal} `list-not-found`, `role-insufficient` or `version-mismatch`.
   */
  public async lockEditableList(
    store: SpacesStore,
    organizationId: string,
    viewer: Viewer,
    listId: string,
    expectedVersions: readonly number[] | null,
  ): Promise<{ readonly space: Space; readonly list: TaskList }> {
    const locked: { readonly space: Space; readonly list: TaskList } | null = await this.lockList(
      store,
      organizationId,
      listId,
    );
    if (locked === null) {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    const access: ViewerAccess = await this.access.resolve(
      store.grants,
      viewer,
      locked.space.snapshot,
      locked.list.snapshot,
    );
    if (access.listRole === null) {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    if (!canManageListAccess(access.listRole)) {
      throw new SpaceRefusal({ reason: 'role-insufficient', role: access.listRole });
    }
    this.checkVersion(locked.list.snapshot.version, expectedVersions);
    return locked;
  }

  /**
   * Method lockList
   *
   * @description
   * Locks a list for a change of its grants: its space `FOR SHARE`, then the list
   * `FOR NO KEY UPDATE`. The list is read first without lock to know its space, which never
   * changes.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<{ readonly space: Space; readonly list: TaskList } | null>} The space and the
   * list, or `null` when the organization has no such list.
   */
  public async lockList(
    store: SpacesStore,
    organizationId: string,
    listId: string,
  ): Promise<{ readonly space: Space; readonly list: TaskList } | null> {
    const found: TaskList | null = await store.lists.find(organizationId, listId);
    if (found === null) {
      return null;
    }
    const space: Space | null = await store.spaces.lockShared(
      organizationId,
      found.snapshot.spaceId,
    );
    const list: TaskList | null = await store.lists.lock(organizationId, listId);
    if (space === null || list === null) {
      return null;
    }
    return { space, list };
  }

  /**
   * Method checkVersion
   *
   * @description
   * Refuses a stale `If-Match`.
   *
   * @param {number} version - The stored version of the space or the list.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` accepts, or `null`.
   * @throws {SpaceRefusal} `version-mismatch` with the stored version.
   */
  private checkVersion(version: number, expectedVersions: readonly number[] | null): void {
    if (expectedVersions !== null && !expectedVersions.includes(version)) {
      throw new SpaceRefusal({ reason: 'version-mismatch', version });
    }
  }
  // #endregion
}
