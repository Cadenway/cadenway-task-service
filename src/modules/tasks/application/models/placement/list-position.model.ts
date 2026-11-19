/**
 * Interface ListPosition
 *
 * @description
 * Where a page of the lists of a space starts: after the list placed at `position` with the id
 * `id`, in the order of the sidebar (`(coalesce(restored_at, created_at), id)`, the position of
 * `PlacedList`), so that a list restored from the archives, which goes to the end of its space,
 * is neither lost nor shown twice between two pages. The presentation layer encodes it in the
 * opaque cursor and checks the form of both values when it decodes one.
 */
export interface ListPosition {
  // #region Properties
  /** The position of the last list of the previous page: its restoration, else its creation. */
  readonly position: Date;

  /** Id of the last list of the previous page. */
  readonly id: string;
  // #endregion
}
