/**
 * Interface LabelPosition
 *
 * @description
 * Where a page of labels starts: after the label of this key, in the order the labels are listed
 * in (the folded name, then the key). The presentation layer encodes it in the opaque cursor.
 */
export interface LabelPosition {
  // #region Properties
  /** The folded name the labels are sorted by, of the last label of the previous page. */
  readonly sortKey: string;

  /** The `labelKey` of the last label of the previous page. */
  readonly labelKey: string;
  // #endregion
}
