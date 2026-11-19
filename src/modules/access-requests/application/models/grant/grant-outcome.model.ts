/**
 * Type GrantOutcome
 *
 * @description
 * What the spaces module did with the grant of an approval: `granted`, raised or created, or kept
 * when the requester already held this role or a higher one (`changed: false`); or `refused` with
 * the rule of the grants that refused it (`not-found`: the space or the list no longer exists).
 *
 * @type {{ readonly outcome: 'granted'; readonly changed: boolean } | { readonly outcome: 'refused'; readonly reason: 'not-found' | 'grantee-invalid' | 'guest-space-forbidden' | 'owner-unchangeable' | 'grant-limit-reached' }}
 */
export type GrantOutcome =
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
