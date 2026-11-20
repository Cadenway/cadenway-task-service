import type { CommentMention } from '../../policies/comment/comment-text.policy.js';

/** Stored comment state, including content-free tombstones (P3b-2 decisions 1, 5 and 6). */
export interface CommentState {
  // #region Properties
  /** Database-assigned comment ID. */
  readonly id: string;

  /** Tenant owning the comment. */
  readonly organizationId: string;

  /** Task owning the comment. */
  readonly taskId: string;

  /** Trusted author type. */
  readonly actorType: 'user' | 'automation' | 'git' | 'system';

  /** Trusted author ID. */
  readonly actorId: string;

  /** Unchanged Markdown, null only for a tombstone. */
  readonly body: string | null;

  /** Structured spans, empty for a tombstone. */
  readonly mentions: readonly CommentMention[];

  /** Immutable reply reference, retained after the target is deleted. */
  readonly replyToCommentId: string | null;

  /** Creation instant. */
  readonly createdAt: Date;

  /** Most recent edit instant, if edited. */
  readonly editedAt: Date | null;

  /** Deletion instant, if a tombstone. */
  readonly deletedAt: Date | null;

  /** Comment version. */
  readonly version: number;
  // #endregion
}
