/**
 * Effective list access established for an authenticated member, including the list lifecycle
 * checked in `openapi/public/intake.yaml`.
 */
export interface IntakeEditorContext {
  // #region Properties
  /** The authenticated member's effective role on the list, or null when hidden. */
  readonly role: 'edit' | 'comment' | 'view' | null;

  /** Current state of the list. */
  readonly lifecycle: 'active' | 'archived' | 'removed';
  // #endregion
}
