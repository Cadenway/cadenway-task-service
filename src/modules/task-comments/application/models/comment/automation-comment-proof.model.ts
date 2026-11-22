/** Server-side membership proof that can be checked in the comment transaction. */
export interface AutomationCommentProof {
  // #region Methods
  /** Holds the matching local membership for the specific tenant and author. */
  confirms(organizationId: string, userId: string): Promise<boolean>;
  // #endregion
}
