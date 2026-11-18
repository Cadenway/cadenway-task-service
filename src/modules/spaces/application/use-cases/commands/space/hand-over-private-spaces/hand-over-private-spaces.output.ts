/**
 * Type HandOverPrivateSpacesOutput
 *
 * @description
 * What one batch of the handover of the private spaces of a member who left did:
 *
 * - `none-left`: the account owns no private space that does not await an owner; the handover is
 *   over, and the copy of the memberships was not read;
 * - `member-again`: the copy holds the account as a member again (a new membership joined after
 *   the removal), or names it the owner of the organization: nothing changed, and the caller stops
 *   for good, so the person keeps the spaces left;
 * - `handed-over`: the batch passed `handedOver` spaces to the owner of the organization, or
 *   marked `awaitingOwner` spaces as awaiting one while the copy does not hold that owner (one of
 *   the two counts is 0). These spaces left the filter of the batch: the caller asks again until
 *   `none-left`.
 */
export type HandOverPrivateSpacesOutput =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | {
      readonly outcome: 'handed-over';
      readonly handedOver: number;
      readonly awaitingOwner: number;
    };
