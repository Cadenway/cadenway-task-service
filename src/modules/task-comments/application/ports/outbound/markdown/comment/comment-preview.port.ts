/** Converts a stored Markdown body into a bounded plain-text preview. */
export interface CommentPreview {
  // #region Methods
  /** Returns the preview for one live comment. */
  render(body: string): string;
  // #endregion
}
