/**
 * Type GrantOutcome
 *
 * @description
 * What the spaces module did with the grant of an approval: `granted`, raised or created, or kept
 * when the requester already held this role or a higher one (`changed: false`); or `refused` with
 * the rule that refused it (`not-found`: the space or the list no longer exists;
 * `manage-forbidden`: on the locked rows, the actor no longer manages the target).
 *
 * @type {{ readonly outcome: 'granted'; readonly changed: boolean } | { readonly outcome: 'refused'; readonly reason: 'not-found' | 'manage-forbidden' | 'grantee-invalid' | 'guest-space-forbidden' | 'owner-unchangeable' | 'grant-limit-reached' }}
 */
export type GrantOutcome =
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
