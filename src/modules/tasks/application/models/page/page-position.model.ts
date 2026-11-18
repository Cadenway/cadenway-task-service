/**
 * Interface PagePosition
 *
 * @description
 * Where a page of subtasks starts: after the task created at `createdAt` with the id `id`, the
 * order of their creation with the id as tie-breaker. The presentation layer encodes it in the
 * opaque cursor and checks the form of both values when it decodes one.
 */
export interface PagePosition {
  // #region Properties
  /** Creation instant of the last row of the previous page. */
  readonly createdAt: Date;

  /** Id of the last row of the previous page. */
  readonly id: string;
  // #endregion
}
