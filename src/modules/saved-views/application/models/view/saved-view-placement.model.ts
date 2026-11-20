/** Existing parent and the current permission to see or edit its views. */
export interface SavedViewPlacement {
  // #region Properties
  /** Space that contains the list. */
  readonly spaceId: string;

  /** Archive instant, null while active. */
  readonly archivedAt: Date | null;

  /** Actor's current effective list role. */
  readonly role: 'edit' | 'comment' | 'view';
  // #endregion
}
