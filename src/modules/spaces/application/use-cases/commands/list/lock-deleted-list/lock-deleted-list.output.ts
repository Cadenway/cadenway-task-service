/**
 * Type LockDeletedListOutput
 *
 * @description
 * Where a list stands for a caller that serializes with its deletion:
 *
 * - `deleted`: the list is a tombstone, locked `FOR UPDATE` (after its space `FOR NO KEY UPDATE`)
 *   until the end of the transaction of the caller, read again under the lock;
 * - `live`: the list is not deleted (archived or not), or was restored meanwhile; read without
 *   lock when it was live from the start;
 * - `not-found`: the organization has no such list (unknown, or erased meanwhile); no lock taken
 *   when it was unknown from the start.
 *
 * @type {object}
 */
export type LockDeletedListOutput =
  | { readonly outcome: 'deleted' }
  | { readonly outcome: 'live' }
  | { readonly outcome: 'not-found' };
