import { InvalidCommentError } from '../../errors/comment/invalid-comment.error.js';

/** A structured mention, measured in Unicode code points (P3b-2 decision 3). */
export interface CommentMention {
  // #region Properties
  /** The account addressed by this span. */
  readonly userId: string;

  /** The inclusive code-point offset. */
  readonly start: number;

  /** The exclusive code-point offset. */
  readonly end: number;
  // #endregion
}

/**
 * Validates unchanged Markdown and non-overlapping structured mentions (P3b-2 decisions 2 and 3).
 * Recipient membership and visibility are checked separately within the write transaction.
 *
 * @param body - Submitted Markdown.
 * @param mentions - Spans in code-point offsets.
 * @throws {InvalidCommentError} When text or spans violate the contract.
 */
export function validateCommentText(body: string, mentions: readonly CommentMention[]): void {
  const points: string[] = Array.from(body);
  if (points.length < 1 || points.length > 5000 || !/\S/u.test(body) || body.includes('\0')) {
    throw new InvalidCommentError();
  }
  if (mentions.length > 20) throw new InvalidCommentError('mentions');
  const sorted: CommentMention[] = [...mentions].sort((a, b) => a.start - b.start);
  let previousEnd: number = 0;
  for (const span of sorted) {
    if (
      span.userId === '' ||
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < previousEnd ||
      span.end <= span.start + 1 ||
      span.end > points.length ||
      points[span.start] !== '@' ||
      points
        .slice(span.start + 1, span.end)
        .join('')
        .trim() === ''
    ) {
      throw new InvalidCommentError('mentions');
    }
    previousEnd = span.end;
  }
}

/**
 * Returns at most 240 Unicode code points for activity, without changing the source.
 *
 * @param body - Valid Markdown source.
 * @returns The excerpt.
 */
export function commentExcerpt(body: string): string {
  return Array.from(body).slice(0, 240).join('');
}
