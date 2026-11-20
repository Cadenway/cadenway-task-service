/**
 * Type LockedDeletedList
 *
 * @description
 * What the lock of a deleted list found (`LockDeletedList` of the spaces module): `deleted` when
 * the list is still deleted under its lock (its space `FOR NO KEY UPDATE`, then the list
 * `FOR UPDATE`, held until the commit); `live` for a live list or one a restoration brought back
 * meanwhile, and `not-found` for an unknown or erased list, neither of them locked.
 *
 * @type {{ readonly outcome: 'deleted' } | { readonly outcome: 'live' } | { readonly outcome: 'not-found' }}
 */
export type LockedDeletedList =
  | { readonly outcome: 'deleted' }
  | { readonly outcome: 'live' }
  | { readonly outcome: 'not-found' };
