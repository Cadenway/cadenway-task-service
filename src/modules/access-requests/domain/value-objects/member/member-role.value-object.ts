/**
 * Type MemberRole
 *
 * @description
 * Role of a member in an organization, as `Role` of `asyncapi/organization-service.yaml` names it:
 * `owner`, `admin`, `member` or `guest`. This module reads it from the copy of the memberships of
 * the organization-members module (decision 4 of the P3a plan), never from the `role` claim of the
 * internal token.
 *
 * @type {'owner' | 'admin' | 'member' | 'guest'}
 */
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
