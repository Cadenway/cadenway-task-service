import { canEdit } from '../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import type { EditableListLookup } from '../../models/list/editable-list-lookup.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { AccessResolver } from '../access/access-resolver.service.js';

/**
 * Class EditableListLocator
 *
 * @description
 * The ONE guard of the writes of a list (`PATCH`, its archive and its restorations), with the
 * refusals of every write of a list in their order ("Who changes what" of
 * `openapi/public/spaces.yaml`, "Who" of `openapi/public/archives.yaml`): a list that does not
 * exist, or that the actor has no role on (`listRoleOf`), answers `list-not-found`; one they have a
 * role on without `edit` `role-insufficient` with that role; an `If-Match` that does not name the
 * stored version `version-mismatch` with it. The list is locked `FOR NO KEY UPDATE` before it is
 * read, so two changes of one list apply one after the other, then its space is read without
 * lock, then the role is computed. `find` answers the refusals of the access, for a caller that
 * maps them to outcomes of its own; `lock` throws them and checks `If-Match` last.
 */
export class EditableListLocator {
  // #region Properties
  /**
   * Property access
   *
   * @description
   * Decides what the actor reaches of the list.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver = new AccessResolver();
  // #endregion

  // #region Methods
  /**
   * Method find
   *
   * @description
   * Locks the list and checks that the actor has `edit` on it, without throwing: the list, or the
   * refusal of the access. It does not read `If-Match`.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {Viewer} viewer - The actor and their role in the organization.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The id of the list.
   * @returns {Promise<EditableListLookup>} The locked list, `list-not-found` or
   * `role-insufficient` with the role of the actor.
   */
  public async find(
    store: SpacesStore,
    viewer: Viewer,
    organizationId: string,
    listId: string,
  ): Promise<EditableListLookup> {
    const stored: TaskList | null = await store.lists.lock(organizationId, listId);
    if (stored === null) {
      return { outcome: 'list-not-found' };
    }
    const space: Space | null = await store.spaces.find(organizationId, stored.snapshot.spaceId);
    if (space === null) {
      return { outcome: 'list-not-found' };
    }
    const access: ViewerAccess = await this.access.resolve(
      store.grants,
      viewer,
      space.snapshot,
      stored.snapshot,
    );
    if (access.listRole === null) {
      return { outcome: 'list-not-found' };
    }
    if (!canEdit(access.listRole)) {
      return { outcome: 'role-insufficient', role: access.listRole };
    }
    return { outcome: 'locked', list: stored };
  }

  /**
   * Method lock
   *
   * @description
   * Locks the list and checks that the actor has `edit` on it (`find`), then that `If-Match`
   * names its version.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {Viewer} viewer - The actor and their role in the organization.
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The id of the list.
   * @param {readonly number[] | null} expectedVersions - The versions `If-Match` names, `null`
   * without the header.
   * @returns {Promise<TaskList>} The locked list.
   * @throws {SpaceRefusal} `list-not-found`, `role-insufficient` or `version-mismatch`.
   */
  public async lock(
    store: SpacesStore,
    viewer: Viewer,
    organizationId: string,
    listId: string,
    expectedVersions: readonly number[] | null,
  ): Promise<TaskList> {
    const found: EditableListLookup = await this.find(store, viewer, organizationId, listId);
    if (found.outcome === 'list-not-found') {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    if (found.outcome === 'role-insufficient') {
      throw new SpaceRefusal({ reason: 'role-insufficient', role: found.role });
    }
    const storedVersion: number = found.list.snapshot.version;
    if (expectedVersions !== null && !expectedVersions.includes(storedVersion)) {
      throw new SpaceRefusal({ reason: 'version-mismatch', version: storedVersion });
    }
    return found.list;
  }
  // #endregion
}
