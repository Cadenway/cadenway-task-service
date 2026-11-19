import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/status/status-key.value-object.js';

/**
 * Type SpaceRefusalReason
 *
 * @description
 * Why a use case of the spaces module refuses a request, with what the caller needs to answer it
 * (`openapi/internal/task-service.yaml`): the presentation layer maps each reason to its problem.
 *
 * - `organization-not-found`: the copy of the memberships does not hold the actor as a member.
 * - `role-forbidden`: a guest creates a space.
 * - `space-not-found`, `list-not-found`: unknown, or not seen by the actor.
 * - `prefix-taken`: another space of the organization uses or used the prefix.
 * - `visibility-forbidden`: the actor may not change the visibility of the space.
 * - `status-required`: a patch hides `todo` or `done`.
 * - `sprint-dates-invalid`: the end of a sprint is before its start.
 * - `version-mismatch`: `If-Match` names another version than the stored one.
 * - `role-insufficient`: the actor sees the space or the list without `edit` on it; `role` is
 *   their role there, `null` for a space they see only through some of its lists.
 * - `manage-forbidden`: the actor sees the space but does not manage it, for its grants.
 * - `grantee-invalid`: the person given access is not a current member or guest.
 * - `guest-space-forbidden`: a grant of a space for a guest.
 * - `owner-unchangeable`: a grant given to, or removed from, the owner of the space.
 * - `grant-limit-reached`: a new grant on a space or a list that already holds 200.
 *
 * @type {object}
 */
export type SpaceRefusalReason =
  | { readonly reason: 'organization-not-found' }
  | { readonly reason: 'role-forbidden' }
  | { readonly reason: 'space-not-found' }
  | { readonly reason: 'list-not-found' }
  | { readonly reason: 'prefix-taken'; readonly prefix: string }
  | { readonly reason: 'visibility-forbidden' }
  | { readonly reason: 'status-required'; readonly status: StatusKey }
  | { readonly reason: 'sprint-dates-invalid' }
  | { readonly reason: 'version-mismatch'; readonly version: number }
  | { readonly reason: 'role-insufficient'; readonly role: AccessRole | null }
  | { readonly reason: 'manage-forbidden' }
  | { readonly reason: 'grantee-invalid'; readonly userId: string }
  | { readonly reason: 'guest-space-forbidden' }
  | { readonly reason: 'owner-unchangeable' }
  | { readonly reason: 'grant-limit-reached' };
