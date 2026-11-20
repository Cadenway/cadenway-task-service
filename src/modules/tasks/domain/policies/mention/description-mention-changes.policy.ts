import type { DescriptionMentionChanges } from '../../value-objects/mention/description-mention-changes.value-object.js';
import type { DescriptionMention } from '../../value-objects/mention/description-mention.value-object.js';

/**
 * Compares distinct mention accounts independently of their spelling and span positions.
 *
 * @param before - Previously stored spans.
 * @param after - Replacement spans.
 * @returns The account IDs added and removed in canonical lowercase.
 */
export function descriptionMentionChanges(
  before: readonly DescriptionMention[],
  after: readonly DescriptionMention[],
): DescriptionMentionChanges {
  const previous = new Set(before.map((span) => span.userId.toLowerCase()));
  const next = new Set(after.map((span) => span.userId.toLowerCase()));
  return {
    added: [...next].filter((id) => !previous.has(id)),
    removed: [...previous].filter((id) => !next.has(id)),
  };
}
