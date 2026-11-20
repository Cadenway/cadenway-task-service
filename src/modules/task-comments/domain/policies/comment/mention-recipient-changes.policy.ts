import type { CommentMention } from './comment-text.policy.js';
import type { MentionRecipientChanges } from '../../value-objects/comment/mention-recipient-changes.value-object.js';

/**
 * Compares unique account IDs of structured spans for an edit (P3b-2 decisions 3 and 4).
 * The application must first check current membership and access in its transaction.
 * UUIDs are case-insensitive and are returned in canonical lowercase form.
 *
 * @param before - Previously stored spans.
 * @param after - Replacement spans.
 * @returns Added and removed accounts in their first-seen order.
 */
export function mentionRecipientChanges(
  before: readonly CommentMention[],
  after: readonly CommentMention[],
): MentionRecipientChanges {
  const oldIds = new Set(
    before.map((mention: CommentMention): string => mention.userId.toLowerCase()),
  );
  const newIds = new Set(
    after.map((mention: CommentMention): string => mention.userId.toLowerCase()),
  );
  return {
    added: [...newIds].filter((id: string): boolean => !oldIds.has(id)),
    removed: [...oldIds].filter((id: string): boolean => !newIds.has(id)),
  };
}
