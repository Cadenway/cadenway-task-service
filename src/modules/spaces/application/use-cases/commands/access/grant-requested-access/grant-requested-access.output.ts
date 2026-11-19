/**
 * Type GrantRequestedAccessOutput
 *
 * @description
 * What the approval did: `granted` (`changed: false` when the requester already held this role or
 * a higher one), or `refused` with the rule that refused it, which the caller answers with the
 * `422` of the grant routes (`not-found`: the space or the list no longer exists;
 * `manage-forbidden`: on the locked rows, the actor no longer answers requests for the target,
 * which the caller answers as a request it may not answer).
 *
 * @type {{ readonly outcome: 'granted'; readonly changed: boolean } | { readonly outcome: 'refused'; readonly reason: 'not-found' | 'manage-forbidden' | 'grantee-invalid' | 'guest-space-forbidden' | 'owner-unchangeable' | 'grant-limit-reached' }}
 */
export type GrantRequestedAccessOutput =
  | { readonly outcome: 'granted'; readonly changed: boolean }
  | {
      readonly outcome: 'refused';
      readonly reason:
        | 'not-found'
        | 'manage-forbidden'
        | 'grantee-invalid'
        | 'guest-space-forbidden'
        | 'owner-unchangeable'
        | 'grant-limit-reached';
    };
