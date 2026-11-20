/**
 * Interface LockTrashListsInput
 *
 * @description
 * The lists of trash entries another module is about to hand over or erase, how to lock them, and
 * the member whose role on them it checks again under the locks.
 */
export interface LockTrashListsInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the context, the one of the tenant transaction the use case joins.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property listIds
   *
   * @description
   * The ids of the lists, in any order; an id given twice is answered once.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly listIds: readonly string[];

  /** Additional spaces to include in the same ordered placement lock. */
  readonly additionalSpaceIds?: readonly string[];

  /**
   * Property mode
   *
   * @description
   * `hold` to lock the spaces and the lists `FOR SHARE` (a change of the access to them, or a
   * deletion of them, waits for the commit of the caller); `erase` to lock the spaces
   * `FOR NO KEY UPDATE` and the lists `FOR UPDATE`, the modes in which the caller may erase a
   * tombstone left without a task (`PurgeDeletedList`) without taking a stronger list lock.
   *
   * @type {'hold' | 'erase'}
   * @readonly
   */
  readonly mode: 'hold' | 'erase';

  /**
   * Property viewer
   *
   * @description
   * The member whose role on each list is read again under the locks, as if neither the list nor
   * its space were deleted (`FindTrashList`), or `null` for a caller that acts for the service.
   *
   * @type {{ readonly userId: string; readonly role: 'owner' | 'admin' | 'member' | 'guest' } | null}
   * @readonly
   */
  readonly viewer: {
    readonly userId: string;
    readonly role: 'owner' | 'admin' | 'member' | 'guest';
  } | null;
  // #endregion
}
