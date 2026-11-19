/**
 * Type AccessRole
 *
 * @description
 * A role on a space or a list ("Droit d’accès", `AccessRole` of
 * `openapi/internal/task-service.yaml`): `edit` ("Peut modifier"), `comment` ("Peut commenter",
 * which reads like `view` until comments exist, decision 1 of P3b-1) or `view` ("Lecture seule"),
 * from the most to the least. Reads need any role, changes of a list and its tasks need `edit`.
 *
 * @type {'edit' | 'comment' | 'view'}
 */
export type AccessRole = 'edit' | 'comment' | 'view';

/**
 * Constant ACCESS_ROLES
 *
 * @description
 * The three roles, from the most to the least (the order of the share dialog of the mockup,
 * `ROLE_OPTS`).
 *
 * @type {readonly AccessRole[]}
 */
export const ACCESS_ROLES: readonly AccessRole[] = Object.freeze(['edit', 'comment', 'view']);

/**
 * Function isAccessRole
 *
 * @description
 * Whether a stored or received text is one of the three roles; anything else is refused (a stored
 * role outside them is a defect, a received one is refused by the contract validators).
 *
 * @param {string} value - The text.
 * @returns {boolean} Whether it is `edit`, `comment` or `view`.
 */
export function isAccessRole(value: string): value is AccessRole {
  return (ACCESS_ROLES as readonly string[]).includes(value);
}

/**
 * Function rankOf
 *
 * @description
 * The rank of a role, 3 for `edit` down to 1 for `view`, 0 for no role: the higher gives more.
 *
 * @param {AccessRole | null} role - The role, or `null` for none.
 * @returns {number} Its rank.
 */
export function rankOf(role: AccessRole | null): number {
  switch (role) {
    case 'edit':
      return 3;
    case 'comment':
      return 2;
    case 'view':
      return 1;
    case null:
      return 0;
  }
}
