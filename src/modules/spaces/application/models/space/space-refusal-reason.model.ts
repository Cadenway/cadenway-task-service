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
  | { readonly reason: 'version-mismatch'; readonly version: number };
