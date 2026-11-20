import type { CommentExcerptRecord } from '../../../../models/comment/comment-excerpt-record.model.js';
import type { CommentPreview } from '../../../../ports/outbound/markdown/comment/comment-preview.port.js';
import type { CommentExcerptReader } from '../../../../ports/outbound/persistence/comment/comment-excerpt-reader.port.js';
import type { FindCommentExcerptsInput } from './find-comment-excerpts.input.js';
import type { FindCommentExcerptsOutput } from './find-comment-excerpts.output.js';

/** Reads current excerpts for already authorized task-comment pairs. */
export class FindCommentExcerpts {
  // #region Properties
  /** Tenant-scoped reader joining the caller's snapshot. */
  private readonly comments: CommentExcerptReader;

  /** Converts live source text into a notification preview. */
  private readonly preview: CommentPreview;
  // #endregion

  // #region Constructor
  /** Takes the snapshot-bound comment reader. */
  public constructor(comments: CommentExcerptReader, preview: CommentPreview) {
    this.comments = comments;
    this.preview = preview;
  }
  // #endregion

  // #region Methods
  /** Returns excerpts for live comments on the supplied visible tasks. */
  public async execute(input: FindCommentExcerptsInput): Promise<FindCommentExcerptsOutput> {
    if (input.pairs.length > 100) {
      throw new RangeError('At most 100 comment excerpts can be read at once.');
    }
    if (input.pairs.length === 0) return [];
    const comments: readonly CommentExcerptRecord[] = await this.comments.findLive(
      input.organizationId,
      input.pairs,
    );
    return comments.map((comment: CommentExcerptRecord) => ({
      taskId: comment.taskId,
      commentId: comment.commentId,
      excerpt: this.preview.render(comment.body),
    }));
  }
  // #endregion
}
