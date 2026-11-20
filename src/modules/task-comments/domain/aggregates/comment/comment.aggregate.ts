import { InvalidCommentError } from '../../errors/comment/invalid-comment.error.js';
import type { CommentMention } from '../../policies/comment/comment-text.policy.js';
import { validateCommentText } from '../../policies/comment/comment-text.policy.js';
import type { CommentState } from '../../value-objects/comment/comment-state.value-object.js';

/** A comment or content-free tombstone (P3b-2 decisions 1, 2, 5 and 6). */
export class Comment {
  // #region Properties
  /** The validated stored state. */
  public readonly snapshot: CommentState;
  // #endregion

  // #region Constructor
  /** Keeps a validated state. */
  private constructor(state: CommentState) {
    this.snapshot = state;
  }
  // #endregion

  // #region Methods
  /**
   * Reconstructs a comment and refuses invalid stored state.
   *
   * @param state - Stored comment state.
   * @returns The validated comment.
   * @throws {InvalidCommentError} When the state violates an invariant.
   */
  public static restore(state: CommentState): Comment {
    if (
      !state.id ||
      !state.organizationId ||
      !state.taskId ||
      !state.actorId ||
      !['user', 'automation', 'git', 'system'].includes(state.actorType) ||
      !Number.isInteger(state.version) ||
      state.version < 1 ||
      Number.isNaN(state.createdAt.getTime()) ||
      (state.editedAt !== null && Number.isNaN(state.editedAt.getTime())) ||
      (state.deletedAt !== null && Number.isNaN(state.deletedAt.getTime())) ||
      (state.deletedAt === null) !== (state.body !== null) ||
      (state.deletedAt !== null && state.mentions.length !== 0)
    ) {
      throw new InvalidCommentError();
    }
    if (state.body !== null) {
      validateCommentText(state.body, state.mentions);
    }
    return new Comment(state);
  }

  /**
   * Replaces live Markdown at the next version.
   *
   * @param body - Unchanged submitted Markdown.
   * @param at - Edit instant supplied by the transaction.
   * @param mentions - Replacement structured mention spans.
   * @returns The edited comment.
   * @throws {InvalidCommentError} When the input is invalid or the comment is deleted.
   */
  public edit(body: string, at: Date, mentions: readonly CommentMention[] = []): Comment {
    if (this.snapshot.deletedAt !== null) throw new InvalidCommentError();
    return Comment.restore({
      ...this.snapshot,
      body,
      mentions,
      editedAt: at,
      version: this.snapshot.version + 1,
    });
  }

  /**
   * Removes the content and leaves a replyable identity as a tombstone.
   *
   * @param at - Deletion instant supplied by the transaction.
   * @returns The deleted comment.
   * @throws {InvalidCommentError} When already deleted or the instant is invalid.
   */
  public delete(at: Date): Comment {
    if (this.snapshot.deletedAt !== null) throw new InvalidCommentError();
    return Comment.restore({
      ...this.snapshot,
      body: null,
      mentions: [],
      deletedAt: at,
      version: this.snapshot.version + 1,
    });
  }
  // #endregion
}
