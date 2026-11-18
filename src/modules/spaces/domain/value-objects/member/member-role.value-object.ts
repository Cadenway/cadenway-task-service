/**
 * Type MemberRole
 *
 * @description
 * Role of a member in an organization, as `Role` of `asyncapi/organization-service.yaml` names it:
 * `owner` ("Propriétaire"), `admin` ("Administrateur"), `member` ("Membre") or `guest`
 * ("Invité"). This module reads it from the copy of the memberships (decision 4 of the P3a plan),
 * never from the `role` claim of the internal token.
 *
 * @type {'owner' | 'admin' | 'member' | 'guest'}
 */
export type MemberRole = 'owner' | 'admin' | 'member' | 'guest';
