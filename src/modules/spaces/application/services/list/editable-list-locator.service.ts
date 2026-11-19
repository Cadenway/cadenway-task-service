import { canEdit } from '../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { AccessResolver } from '../access/access-resolver.service.js';

/**
 * Class EditableListLocator
 *
 * @description
 * Locks a list an actor changes as a whole (its archive and its restoration), with the refusals
 * of every write of a list in their order ("Who changes what" of `openapi/public/spaces.yaml`,
 * "Who" of `openapi/public/archives.yaml`): a list that does not exist, or that the actor has no
 * role on (`listRoleOf`), answers `list-not-found`; one they have a role on without `edit`
 * `role-insufficient` with that role; an `If-Match` that does not name the stored version
 * `version-mismatch` with it. The list is locked `FOR NO KEY UPDATE` before it is read, so two
 * changes of one list apply one after the other, and its space is read without lock.
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
   * Method lock
   *
   * @description
   * Locks the list and checks that the actor has `edit` on it and names its version.
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
    const stored: TaskList | null = await store.lists.lock(organizationId, listId);
    if (stored === null) {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    const space: Space | null = await store.spaces.find(organizationId, stored.snapshot.spaceId);
    if (space === null) {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    const access: ViewerAccess = await this.access.resolve(
      store.grants,
      viewer,
      space.snapshot,
      stored.snapshot,
    );
    if (access.listRole === null) {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    if (!canEdit(access.listRole)) {
      throw new SpaceRefusal({ reason: 'role-insufficient', role: access.listRole });
    }
    const storedVersion: number = stored.snapshot.version;
    if (expectedVersions !== null && !expectedVersions.includes(storedVersion)) {
      throw new SpaceRefusal({ reason: 'version-mismatch', version: storedVersion });
    }
    return stored;
  }
  // #endregion
}
