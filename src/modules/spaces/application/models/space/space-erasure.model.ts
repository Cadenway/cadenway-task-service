/**
 * Type SpaceErasure
 *
 * @description
 * What the erasure of a deleted space did (`DeletedSpaceEraser`):
 *
 * - `purged`: the tombstone and its grants are erased (its prefixes stay reserved);
 * - `not-deleted`: the space is live; nothing was written;
 * - `not-empty`: the space still holds a list row, live, archived or deleted; nothing was written;
 * - `not-found`: the organization has no such space (unknown, or erased already); nothing was
 *   written.
 *
 * @type {'purged' | 'not-deleted' | 'not-empty' | 'not-found'}
 */
export type SpaceErasure = 'purged' | 'not-deleted' | 'not-empty' | 'not-found';
