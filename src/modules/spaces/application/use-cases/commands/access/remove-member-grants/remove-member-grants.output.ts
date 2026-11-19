/**
 * Type RemoveMemberGrantsOutput
 *
 * @description
 * What one batch did: `none-left` (no grant of the account remains: the job moves on),
 * `member-again` (the copy holds the account as a member again: nothing was written and the job
 * stops for good), or `removed` with the number of grants removed.
 *
 * @type {{ readonly outcome: 'none-left' } | { readonly outcome: 'member-again' } | { readonly outcome: 'removed'; readonly removed: number }}
 */
export type RemoveMemberGrantsOutput =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'removed'; readonly removed: number };
