/**
 * Type RequestDropBatch
 *
 * @description
 * What one batch of the dropping of the access requests of a former member, pending or answered,
 * did, as the
 * clean-up job reads it:
 *
 * - `none-left`: the account has no request any more;
 * - `member-again`: the copy of the memberships holds the account as a member again, so nothing
 *   changed and the job stops for good;
 * - `dropped`: the batch dropped `dropped` requests; the job asks for the next batch.
 */
export type RequestDropBatch =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'dropped'; readonly dropped: number };
