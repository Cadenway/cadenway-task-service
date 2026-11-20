/**
 * Interface RestoreTrashEntryInput
 *
 * @description
 * The restoration of a trash entry ("Restaurer").
 */
export interface RestoreTrashEntryInput {
  // #region Properties
  /** The organization of the verified internal token. */
  readonly organizationId: string;

  /** The account of the actor of the internal token. */
  readonly actorUserId: string;

  /** The entry, a UUID the route validated. */
  readonly entryId: string;
  // #endregion
}
