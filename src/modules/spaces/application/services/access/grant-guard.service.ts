import { canManageListAccess } from '../../../domain/policies/access/access-role.policy.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';
import type { CheckedLock } from '../../models/access/checked-lock.model.js';
import type { ViewerAccess } from '../../models/access/viewer-access.model.js';
import type { SpaceRefusalReason } from '../../models/space/space-refusal-reason.model.js';
import { SpaceRefusal } from '../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { AccessResolver } from './access-resolver.service.js';
import { CheckedLocker } from './checked-locker.service.js';

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
 * first: the owner of the space, whom no grant may name, cannot change meanwhile. The actor is
 * checked on the rows read without lock first, so a space or a list they do not see, or may not
 * change, answers at once whatever another transaction holds, then again on the locked rows when
 * they changed meanwhile (`CheckedLocker`); `If-Match` is checked on the locked rows.
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

  /**
   * Property locker
   *
   * @description
   * Checks the actor before the lock, and again on a row that changed.
   *
   * @type {CheckedLocker}
   * @readonly
   */
  private readonly locker: CheckedLocker;
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
    this.locker = new CheckedLocker();
  }
  // #endregion

  // #region Methods
  /**
   * Method lockManagedSpace
   *
   * @description
   * Checks that the actor sees and manages a space, then locks it `FOR NO KEY UPDATE` and checks
   * again when it changed, then `If-Match`.
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
    const checked: CheckedLock<Space, SpaceRefusalReason> = await this.locker.space(
      store,
      organizationId,
      spaceId,
      'update',
      async (space: Space): Promise<SpaceRefusalReason | null> => {
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          null,
        );
        if (!access.seesSpace) {
          return { reason: 'space-not-found' };
        }
        return access.canManage ? null : { reason: 'manage-forbidden' };
      },
    );
    if (checked.outcome === 'unknown') {
      throw new SpaceRefusal({ reason: 'space-not-found' });
    }
    if (checked.outcome === 'refused') {
      throw new SpaceRefusal(checked.refusal);
    }
    this.checkVersion(checked.locked.snapshot.version, expectedVersions);
    return checked.locked;
  }

  /**
   * Method lockEditableList
   *
   * @description
   * Checks that the actor has `edit` on a list, then locks it after its space `FOR SHARE` and
   * checks again when one of them changed, then `If-Match`.
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
    const checked: CheckedLock<
      { readonly space: Space; readonly list: TaskList },
      SpaceRefusalReason
    > = await this.locker.list(
      store,
      organizationId,
      listId,
      'share',
      async (space: Space, list: TaskList): Promise<SpaceRefusalReason | null> => {
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          list.snapshot,
        );
        if (access.listRole === null) {
          return { reason: 'list-not-found' };
        }
        return canManageListAccess(access.listRole)
          ? null
          : { reason: 'role-insufficient', role: access.listRole };
      },
    );
    if (checked.outcome === 'unknown') {
      throw new SpaceRefusal({ reason: 'list-not-found' });
    }
    if (checked.outcome === 'refused') {
      throw new SpaceRefusal(checked.refusal);
    }
    this.checkVersion(checked.locked.list.snapshot.version, expectedVersions);
    return checked.locked;
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
