/** Comment activity to append after its task has been locked and versioned. */
export interface RecordCommentActivityInput {
  // #region Properties
  /** Tenant ID. */
  readonly organizationId: string;

  /** Acting account ID. */
  readonly actorUserId: string;

  /** Authenticated rule attribution for a delegated comment creation. */
  readonly actor?: { readonly type: 'automation'; readonly id: string };

  /** Task key. */
  readonly taskKey: string;

  /** Version already assigned by BeginComment. */
  readonly taskVersion: number;

  /** Stored comment ID. */
  readonly commentId: string;

  /** Source excerpt, at most 240 code points. */
  readonly excerpt: string;

  /** Existing activity mutation; omitted for creation. */
  readonly change?: 'edit' | 'delete';
  // #endregion
}
