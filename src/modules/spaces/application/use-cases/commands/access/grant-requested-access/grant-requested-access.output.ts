/**
 * Type GrantRequestedAccessOutput
 *
 * @description
 * What the approval did: `granted` (`changed: false` when the requester already held this role or
 * a higher one), or `refused` with the rule that refused it, which the caller answers with the
 * `422` of the grant routes (`not-found`: the space or the list no longer exists).
 *
 * @type {{ readonly outcome: 'granted'; readonly changed: boolean } | { readonly outcome: 'refused'; readonly reason: 'not-found' | 'grantee-invalid' | 'guest-space-forbidden' | 'owner-unchangeable' | 'grant-limit-reached' }}
 */
export type GrantRequestedAccessOutput =
  | { readonly outcome: 'granted'; readonly changed: boolean }
  | {
      readonly outcome: 'refused';
      readonly reason:
        | 'not-found'
        | 'grantee-invalid'
        | 'guest-space-forbidden'
        | 'owner-unchangeable'
        | 'grant-limit-reached';
    };
