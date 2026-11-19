/**
 * Type DropMemberAccessRequestsOutput
 *
 * @description
 * What one batch did: `none-left` (no pending request of the account remains), `member-again`
 * (the copy holds the account as a member again: nothing was written and the job stops for good),
 * or `dropped` with the number of requests dropped.
 *
 * @type {{ readonly outcome: 'none-left' } | { readonly outcome: 'member-again' } | { readonly outcome: 'dropped'; readonly dropped: number }}
 */
export type DropMemberAccessRequestsOutput =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'dropped'; readonly dropped: number };
