/** The verified actor and the candidate spaces from the validated request. */
export interface ResolveDocumentSpaceAccessInput {
  // #region Properties
  /** Organization from the verified internal token. */
  readonly organizationId: string;

  /** User from the verified internal token. */
  readonly viewerUserId: string;

  /** Zero to 100 candidate space IDs. */
  readonly spaceIds: readonly string[];
  // #endregion
}
