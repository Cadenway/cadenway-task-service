import type { EventActor } from '../../../../../application/models/actor/event-actor.model.js';
import type { StoredGrant } from '../../../../../application/models/access/stored-grant.model.js';
import { isAccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';

/**
 * Interface GrantRow
 *
 * @description
 * The columns a grant shares in `space_grants` and `list_grants`.
 */
export interface GrantRow {
  // #region Properties
  /**
   * Property userId
   *
   * @description
   * The account given access.
   *
   * @type {string}
   * @readonly
   */
  readonly userId: string;

  /**
   * Property role
   *
   * @description
   * The stored role.
   *
   * @type {string}
   * @readonly
   */
  readonly role: string;

  /**
   * Property grantedByType
   *
   * @description
   * The kind of actor who gave this role.
   *
   * @type {string}
   * @readonly
   */
  readonly grantedByType: string;

  /**
   * Property grantedById
   *
   * @description
   * The id of the actor who gave this role.
   *
   * @type {string}
   * @readonly
   */
  readonly grantedById: string;

  /**
   * Property createdAt
   *
   * @description
   * When the person was first given access.
   *
   * @type {Date}
   * @readonly
   */
  readonly createdAt: Date;

  /**
   * Property grantedAt
   *
   * @description
   * When this role was given.
   *
   * @type {Date}
   * @readonly
   */
  readonly grantedAt: Date;
  // #endregion
}

/**
 * Function toAccessRole
 *
 * @description
 * Narrows a stored role to `AccessRole`; `null` (no grant) stays `null`. The CHECK constraint of
 * both tables keeps the three roles, so another value means the row was written by something
 * else than this service.
 *
 * @param {string | null} value - The stored role.
 * @returns {AccessRole | null} The role, or `null`.
 * @throws {Error} When the value is not one of the three roles.
 */
export function toAccessRole(value: string | null): AccessRole | null {
  if (value === null) {
    return null;
  }
  if (!isAccessRole(value)) {
    throw new Error('A stored role is not edit, comment or view.');
  }
  return value;
}

/**
 * Function toStoredGrant
 *
 * @description
 * Maps a row of `space_grants` or `list_grants` to the grant it stores. This service writes the
 * actors `user` and `system` only.
 *
 * @param {GrantRow} row - The row.
 * @returns {StoredGrant} The grant.
 * @throws {Error} When the role or the kind of actor is one this service never writes.
 */
export function toStoredGrant(row: GrantRow): StoredGrant {
  const role: AccessRole | null = toAccessRole(row.role);
  if (role === null) {
    throw new Error('A stored grant has a role.');
  }
  if (row.grantedByType !== 'user' && row.grantedByType !== 'system') {
    throw new Error('A stored grant was given by a user or by task-service.');
  }
  const grantedBy: EventActor = { type: row.grantedByType, id: row.grantedById };
  return {
    userId: row.userId,
    role,
    createdAt: row.createdAt,
    grantedAt: row.grantedAt,
    grantedBy,
  };
}
