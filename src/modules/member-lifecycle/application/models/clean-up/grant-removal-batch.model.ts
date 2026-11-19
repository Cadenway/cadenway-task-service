/**
 * Type GrantRemovalBatch
 *
 * @description
 * What one batch of the removal of the grants of a former member did, as the clean-up job reads
 * it:
 *
 * - `none-left`: the account holds no grant of a space or a list any more;
 * - `member-again`: the copy of the memberships holds the account as a member again, so nothing
 *   changed and the job stops for good;
 * - `removed`: the batch removed `removed` grants; the job asks for the next batch.
 */
export type GrantRemovalBatch =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'removed'; readonly removed: number };
