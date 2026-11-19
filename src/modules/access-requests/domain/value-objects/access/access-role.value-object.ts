/**
 * Type AccessRole
 *
 * @description
 * A role an approval gives ("Droit d’accès", `AccessRole` of `openapi/internal/task-service.yaml`):
 * `edit` ("Peut modifier"), `comment` ("Peut commenter") or `view` ("Lecture seule"), from the most
 * to the least (decision 1 of P3b-1). The spaces module owns the grants; this module only records
 * the role an approval asked for, and reads the role a requester has on a target.
 *
 * @type {'edit' | 'comment' | 'view'}
 */
export type AccessRole = 'edit' | 'comment' | 'view';

/**
 * Constant ACCESS_ROLES
 *
 * @description
 * The three roles, from the most to the least.
 *
 * @type {readonly AccessRole[]}
 */
export const ACCESS_ROLES: readonly AccessRole[] = Object.freeze(['edit', 'comment', 'view']);

/**
 * Function isAccessRole
 *
 * @description
 * Whether a stored or received text is one of the three roles.
 *
 * @param {string} value - The text.
 * @returns {boolean} Whether it is `edit`, `comment` or `view`.
 */
export function isAccessRole(value: string): value is AccessRole {
  return (ACCESS_ROLES as readonly string[]).includes(value);
}
