/**
 * Type PurgeDeletedListOutput
 *
 * @description
 * What the erasure of a deleted list did:
 *
 * - `purged`: the tombstone and its grants are erased; `spacePurged` when its space was deleted
 *   and held no other list row, so the tombstone of the space and its grants are erased too (its
 *   prefixes stay reserved);
 * - `not-deleted`: the list is live, archived or not; nothing was written;
 * - `not-found`: the organization has no such list (unknown, or erased already); nothing was
 *   written.
 *
 * @type {object}
 */
export type PurgeDeletedListOutput =
  | { readonly outcome: 'purged'; readonly spacePurged: boolean }
  | { readonly outcome: 'not-deleted' }
  | { readonly outcome: 'not-found' };
