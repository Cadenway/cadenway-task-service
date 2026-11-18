/**
 * Interface TaskPosition
 *
 * @description
 * Where a page of tasks starts: after the task at this position, in the order the page is read in.
 * It holds the value the order sorts by (`sortValue`), then the creation instant and the id that
 * break the ties, so that a keyset page is exact even when many tasks share a value. What
 * `sortValue` holds depends on the order: `null` for the order of creation, the due date or `null`
 * (undated) for the due date, the rank 1 to 4 of the priority, the folded prefix of the name. The
 * presentation layer encodes it in the opaque cursor and checks its form when it decodes one.
 */
export interface TaskPosition {
  // #region Properties
  /** The sort value of the last task of the previous page. */
  readonly sortValue: string | number | null;

  /** Creation instant of the last task of the previous page. */
  readonly createdAt: Date;

  /** Id of the last task of the previous page. */
  readonly id: string;
  // #endregion
}
