import type { Comment } from '../../../../../domain/aggregates/comment/comment.aggregate.js';
import type { CommentDraft } from '../../../../models/comment/comment-draft.model.js';
import type { CommentPosition } from '../../../../models/comment/comment-position.model.js';

/** Tenant-scoped comment storage; each method joins its caller's transaction. */
export interface CommentRepository {
  // #region Methods
  /** Inserts a comment and returns the database-assigned state. */
  insert(draft: CommentDraft): Promise<Comment>;

  /** Reads a comment of a task, including a tombstone when requested. */
  find(
    organizationId: string,
    taskId: string,
    id: string,
    includeDeleted: boolean,
  ): Promise<Comment | null>;

  /** Reads live comments in ascending creation and ID order, after an optional position. */
  list(
    organizationId: string,
    taskId: string,
    after: CommentPosition | null,
    limit: number,
  ): Promise<readonly Comment[]>;

  /** Counts live comments on one task. */
  count(organizationId: string, taskId: string): Promise<number>;

  /** Saves an edited or deleted comment only if its preceding version still matches. */
  update(comment: Comment, expectedVersion: number): Promise<boolean>;
  // #endregion
}
