/** The actor, list and accepted source versions of a list copy. */
export interface DuplicateListInput {
  // #region Properties
  /** The verified tenant. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly listId: string;
  readonly expectedVersions: readonly number[] | null;
  // #endregion
}
