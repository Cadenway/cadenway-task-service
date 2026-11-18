/**
 * Type SpaceHandoverBatch
 *
 * @description
 * What one batch of the handover of the private spaces of a former member did, as the clean-up
 * job reads it:
 *
 * - `none-left`: the account owns no private space left to hand over;
 * - `member-again`: the copy of the memberships holds the account as a member again, so nothing
 *   changed and the job stops for good;
 * - `handed-over`: the batch gave `handedOver` spaces to the owner of the organization, or left
 *   `awaitingOwner` spaces awaiting one while the copy does not hold that owner; the job asks for
 *   the next batch.
 */
export type SpaceHandoverBatch =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | {
      readonly outcome: 'handed-over';
      readonly handedOver: number;
      readonly awaitingOwner: number;
    };
