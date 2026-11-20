/** A directed edge retained in the task graph until either endpoint is purged. */
export interface DependencyEdge {
  // #region Properties
  /** Database-assigned edge id. */
  readonly id: string;

  /** Task id at the origin of the edge. */
  readonly blockerId: string;

  /** Task id at the destination of the edge. */
  readonly blockedId: string;

  /** Creation instant used in the stable dependency page. */
  readonly createdAt: Date;
  // #endregion
}
