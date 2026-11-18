/**
 * Interface ActivityPosition
 *
 * @description
 * Where a page of activity entries starts: after the entry that occurred at `occurredAt` with the
 * id `id`, in the order most recent first with the id as tie-breaker.
 */
export interface ActivityPosition {
  // #region Properties
  /** Instant of the last entry of the previous page. */
  readonly occurredAt: Date;

  /** Id of the last entry of the previous page. */
  readonly id: string;
  // #endregion
}
