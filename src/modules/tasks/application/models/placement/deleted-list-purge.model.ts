/**
 * Type DeletedListPurge
 *
 * @description
 * What the spaces module answers when an erasure hands it a list no task row references any more
 * (`PurgeDeletedList`): `purged` for a deleted list it erased, with whether its deleted space went
 * with it (no list left); `not-deleted` for a live list, left alone; `not-found` for a list erased
 * already.
 */
export type DeletedListPurge =
  | { readonly outcome: 'purged'; readonly spacePurged: boolean }
  | { readonly outcome: 'not-deleted' }
  | { readonly outcome: 'not-found' };
