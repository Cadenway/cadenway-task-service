/**
 * Type CheckedLock
 *
 * @description
 * What `CheckedLocker` answers for a space or a list a write locks after checking the actor:
 *
 * - `unknown`: the organization has no such row, or it is a tombstone, on the read without lock or
 *   on the locked one;
 * - `refused`: the check of the caller refused the actor, with its refusal, on the read without
 *   lock, or on the locked row when it changed meanwhile;
 * - `locked`: the check accepted the actor on the locked rows, which stay locked until the end of
 *   the transaction.
 *
 * @type {object}
 */
export type CheckedLock<TLocked, TRefusal> =
  | { readonly outcome: 'unknown' }
  | { readonly outcome: 'refused'; readonly refusal: TRefusal }
  | { readonly outcome: 'locked'; readonly locked: TLocked };
