/**
 * Type PurgeDeletedSpaceOutput
 *
 * @description
 * What the erasure of a deleted space did:
 *
 * - `purged`: the tombstone and its grants are erased (its prefixes stay reserved);
 * - `not-deleted`: the space is live; nothing was written;
 * - `not-empty`: the space still holds a list row, live, archived or deleted; nothing was written;
 * - `not-found`: the organization has no such space (unknown, or erased already); nothing was
 *   written.
 *
 * @type {object}
 */
export type PurgeDeletedSpaceOutput =
  | { readonly outcome: 'purged' }
  | { readonly outcome: 'not-deleted' }
  | { readonly outcome: 'not-empty' }
  | { readonly outcome: 'not-found' };
