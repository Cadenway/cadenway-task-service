/** Verified identity for a custom field operation. */
export interface CustomFieldActor {
  // #region Properties
  /** State used by this operation. */
  readonly organizationId: string;
  readonly actorUserId: string;
  // #endregion
}
