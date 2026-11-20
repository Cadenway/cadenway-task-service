/** Verified organization and user taken from the internal token. */
export interface SavedViewCaller {
  // #region Properties
  /** Tenant of the operation. */
  readonly organizationId: string;

  /** Account of the verified actor. */
  readonly actorUserId: string;
  // #endregion
}
