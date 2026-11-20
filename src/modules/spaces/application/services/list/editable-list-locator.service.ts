import { canEdit } from '../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { CheckedLock } from '../../models/access/checked-lock.model.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import type { EditableListLookup } from '../../models/list/editable-list-lookup.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { AccessResolver } from '../access/access-resolver.service.js';
import { CheckedLocker } from '../access/checked-locker.service.js';

/**
 * Class EditableListLocator
 *
 * @description
 * The ONE guard of the writes of a list (`PATCH`, its archive and its restorations), with the
 * refusals of every write of a list in their order ("Who changes what" of
 * `openapi/public/spaces.yaml`, "Who" of `openapi/public/archives.yaml`): a list that does not
 * exist, or that the actor has no role on (`listRoleOf`), answers `list-not-found`; one they have a
 * role on without `edit` `role-insufficient` with that role; an `If-Match` that does not name the
 * stored version `version-mismatch` with it. The list and its space are read without lock and the
 * role is computed first, so a list the actor does not see, or may not change, answers at once
 * whatever another transaction holds; then the list is locked `FOR NO KEY UPDATE`, so two changes
 * of one list apply one after the other, and the role is computed again on the locked row when it
 * changed meanwhile (`CheckedLocker`). A deleted list, or a list of a deleted space, answers
 * `list-not-found`. `find` answers the refusals of the access, for a caller that maps them to
 * outcomes of its own; `lock` throws them and checks `If-Match` last.
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

  /**
   * Property locker
   *
   * @description
   * Checks the actor before the lock, and again on a row that changed.
   *
   * @type {CheckedLocker}
   * @readonly
   */
  private readonly locker: CheckedLocker = new CheckedLocker();
  // #endregion

  // #region Methods
  /**
   * Method find
   *
   * @description
   * Checks that the actor has `edit` on the list, then locks it and checks again when it changed,
   * without throwing: the list, or the refusal of the access. It does not read `If-Match`.
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
    const checked: CheckedLock<
      { readonly space: Space; readonly list: TaskList },
      Exclude<EditableListLookup, { readonly outcome: 'locked' }>
    > = await this.locker.list(
      store,
      organizationId,
      listId,
      'none',
      async (
        space: Space,
        list: TaskList,
      ): Promise<Exclude<EditableListLookup, { readonly outcome: 'locked' }> | null> => {
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          list.snapshot,
        );
        if (access.listRole === null) {
          return { outcome: 'list-not-found' };
        }
        return canEdit(access.listRole)
          ? null
          : { outcome: 'role-insufficient', role: access.listRole };
      },
    );
    if (checked.outcome === 'unknown') {
      return { outcome: 'list-not-found' };
    }
    if (checked.outcome === 'refused') {
      return checked.refusal;
    }
    return { outcome: 'locked', list: checked.locked.list };
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
