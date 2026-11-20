/** Tenant, verified viewer and task identifiers in one visibility batch. */
export interface FindVisibleTaskLocationsInput {
  // #region Properties
  /** Organization from the verified request context. */
  readonly organizationId: string;

  /** Current member resolved in the enclosing transaction. */
  readonly viewer: {
    readonly userId: string;
    readonly role: 'owner' | 'admin' | 'member' | 'guest';
  };

  /** Task UUIDs to resolve. */
  readonly taskIds: readonly string[];

  /** Exact task keys to resolve. */
  readonly taskKeys: readonly string[];
  // #endregion
}
