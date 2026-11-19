/**
 * Type AccessRequestRefusalReason
 *
 * @description
 * Why a use case of the access-requests module refuses a request, with what the caller needs to
 * answer it (`openapi/internal/task-service.yaml`): the presentation layer maps each reason to its
 * problem.
 *
 * - `organization-not-found`: the copy of the memberships does not hold the actor as a member.
 * - `access-request-not-found`: no request with this id that the actor may answer.
 * - `already-decided`: the request was approved or refused first, with how.
 * - `limit-reached`: the actor asked 10 times within the hour; the next request is possible at
 *   `nextAvailableAt`, `retryAfterSeconds` from now.
 * - `grantee-invalid`, `guest-space-forbidden`, `owner-unchangeable`, `grant-limit-reached`: a rule
 *   of the grants refuses the approval; `userId` names the requester.
 *
 * @type {object}
 */
export type AccessRequestRefusalReason =
  | { readonly reason: 'organization-not-found' }
  | { readonly reason: 'access-request-not-found' }
  | { readonly reason: 'already-decided'; readonly status: 'approved' | 'refused' }
  | {
      readonly reason: 'limit-reached';
      readonly nextAvailableAt: Date;
      readonly retryAfterSeconds: number;
    }
  | { readonly reason: 'grantee-invalid'; readonly userId: string }
  | { readonly reason: 'guest-space-forbidden' }
  | { readonly reason: 'owner-unchangeable' }
  | { readonly reason: 'grant-limit-reached' };
