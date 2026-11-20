import { InvalidDescriptionMentionsError } from '../../errors/task/invalid-description-mentions.error.js';
import type { DescriptionMention } from '../../value-objects/mention/description-mention.value-object.js';

/**
 * Validates recipient spans against unchanged description Markdown in Unicode code points.
 *
 * @param description - The description, or null when absent.
 * @param mentions - Structured spans in any order.
 * @throws {InvalidTaskError} When a span is invalid, overlaps or exceeds the contract limit.
 */
export function validateDescriptionMentions(
  description: string | null,
  mentions: readonly DescriptionMention[],
): void {
  if (mentions.length === 0) return;
  if (mentions.length > 20) throw new InvalidDescriptionMentionsError();
  const points: readonly string[] = Array.from(description ?? '');
  let previousEnd = 0;
  for (const span of [...mentions].sort((left, right) => left.start - right.start)) {
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
      throw new InvalidDescriptionMentionsError();
    }
    previousEnd = span.end;
  }
}
