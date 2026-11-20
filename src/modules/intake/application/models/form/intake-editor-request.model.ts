/** List and verified member from the authenticated internal request context. */
export interface IntakeEditorRequest {
  // #region Properties
  /** Provides organizationId. */
  readonly organizationId: string;

  /** Provides actorUserId. */
  readonly actorUserId: string;

  /** Provides listId. */
  readonly listId: string;
  // #endregion
}
