/** A tenant-scoped task watcher page request. */
export interface ListWatchersInput {
  // #region Properties
  /** Tenant ID. */
  readonly organizationId: string;

  /** Calling account. */
  readonly actorUserId: string;

  /** Task key. */
  readonly taskKey: string;

  /** Last user ID on the preceding page. */
  readonly after: string | null;

  /** Maximum page size. */
  readonly limit: number;
  // #endregion
}
