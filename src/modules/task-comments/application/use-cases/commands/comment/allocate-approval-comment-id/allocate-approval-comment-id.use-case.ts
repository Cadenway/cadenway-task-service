import type { CommentIdAllocator } from '../../../../ports/outbound/persistence/comment/comment-id-allocator.port.js';

/** Reserves a comment identity for a vote before applying the task transition. */
export class AllocateApprovalCommentId {
  // #region Constructor
  /** Takes a transaction-bound UUID allocator. */
  public constructor(private readonly allocator: CommentIdAllocator) {}
  // #endregion

  // #region Methods
  /** Allocates the ID inside the approval's current tenant transaction. */
  public execute(): Promise<string> {
    return this.allocator.allocate();
  }
  // #endregion
}
