/**
 * Type DeletedSpacePurge
 *
 * @description
 * What the erasure of a deleted space did, as the deletion job of a space reads it once its lists
 * were handled: `purged` (the space had no list row left, its grants and its row are erased, its
 * prefixes stay reserved), `not-deleted` (a restoration brought it back), `not-empty` (a deleted
 * list of it still holds tasks in the trash: the purge erases it later, with its last entry) or
 * `not-found` (already erased).
 *
 * @type {'purged' | 'not-deleted' | 'not-empty' | 'not-found'}
 */
export type DeletedSpacePurge = 'purged' | 'not-deleted' | 'not-empty' | 'not-found';
