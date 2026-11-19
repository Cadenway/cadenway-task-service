import { GrantLimitReachedError } from '../../errors/access/grant-limit-reached.error.js';
import { GranteeInvalidError } from '../../errors/access/grantee-invalid.error.js';
import { GuestSpaceForbiddenError } from '../../errors/access/guest-space-forbidden.error.js';
import { OwnerUnchangeableError } from '../../errors/access/owner-unchangeable.error.js';
import { InvalidSpaceError } from '../../errors/space/invalid-space.error.js';
import { isAccessRole, rankOf } from '../../value-objects/access/access-role.value-object.js';
import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { GrantChange } from '../../value-objects/access/grant-change.value-object.js';
import type { GrantEntry } from '../../value-objects/access/grant-entry.value-object.js';
import type { GrantsUpdate } from '../../value-objects/access/grants-update.value-object.js';
import type { ResourceGrantsState } from '../../value-objects/access/resource-grants-state.value-object.js';

/**
 * Constant GRANT_LIMIT
 *
 * @description
 * Most grants a space or a list holds (decision 11 of P3b-1, not in the mockup: the user may
 * revise it). The access events carry every grant, so the limit also bounds their payload.
 *
 * @type {number}
 */
export const GRANT_LIMIT: number = 200;

/**
 * Class ResourceGrants
 *
 * @description
 * Every grant of one space or one list ("Personnes ayant accès", `openapi/public/access.yaml`),
 * loaded whole: a space or a list holds 200 at most. Rules (decision 1 of P3b-1 as the contract
 * fixed it):
 *
 * - a grant goes to a current member or guest of the organization (`GranteeInvalidError`);
 * - the owner of the space holds none and always has `edit` (`OwnerUnchangeableError`);
 * - a guest receives grants of lists only (`GuestSpaceForbiddenError`);
 * - 200 grants at most, a change of role never refused by the limit (`GrantLimitReachedError`);
 * - one grant per person, in the order they were first given; the same role again changes nothing.
 *
 * The time of a grant and who gave it are stored by the application; the domain decides whether
 * anything changes, which the version and the events follow.
 */
export class ResourceGrants {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The grants and what their rules read.
   *
   * @type {ResourceGrantsState}
   * @readonly
   */
  private readonly state: ResourceGrantsState;

  /**
   * Property snapshot
   *
   * @description
   * The grants as plain data, in the order they were first given.
   *
   * @type {ResourceGrantsState}
   */
  public get snapshot(): ResourceGrantsState {
    return this.state;
  }
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Wraps checked grants; use `restore`.
   *
   * @param {ResourceGrantsState} state - The grants.
   * @constructor
   */
  private constructor(state: ResourceGrantsState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method restore
   *
   * @description
   * Rebuilds the grants of a space or a list from storage, refusing a state the rules forbid: two
   * grants of one person, an unknown role, or a grant of the owner of the space. A stored count
   * above the limit is accepted (the limit refuses additions only, so that a lower limit later
   * never locks a resource).
   *
   * @param {ResourceGrantsState} state - The stored grants.
   * @returns {ResourceGrants} The grants.
   * @throws {InvalidSpaceError} When the stored grants break a rule.
   */
  public static restore(state: ResourceGrantsState): ResourceGrants {
    const seen: Set<string> = new Set<string>();
    for (const grant of state.grants) {
      if (seen.has(grant.userId)) {
        throw new InvalidSpaceError('a person holds one grant per space or list');
      }
      if (!isAccessRole(grant.role)) {
        throw new InvalidSpaceError('a grant gives edit, comment or view');
      }
      if (grant.userId === state.ownerUserId) {
        throw new InvalidSpaceError('the owner of the space holds no grant');
      }
      seen.add(grant.userId);
    }
    return new ResourceGrants({ ...state, grants: [...state.grants] });
  }

  /**
   * Method give
   *
   * @description
   * Gives a person a role, or replaces the role they hold (`PUT …/grants/{userId}`, "Droit
   * d’accès"); the same role again changes nothing. A new grant goes after the others.
   *
   * @param {GrantChange} change - The person, the role and their role in the organization.
   * @returns {GrantsUpdate} The grants after the change.
   * @throws {GranteeInvalidError} When the person is not a current member or guest.
   * @throws {OwnerUnchangeableError} When the person owns the space.
   * @throws {GuestSpaceForbiddenError} When a guest would receive a grant of a space.
   * @throws {GrantLimitReachedError} When a new grant would exceed 200.
   */
  public give(change: GrantChange): GrantsUpdate {
    this.check(change);
    const current: GrantEntry | undefined = this.find(change.userId);
    if (current?.role === change.role) {
      return { grants: this, changed: false, role: current.role };
    }
    return this.put(change.userId, change.role, current);
  }

  /**
   * Method raise
   *
   * @description
   * Gives a person at least a role, the approval of an access request ("creates or raises the
   * grant", decision 4 of P3b-1): a new grant, or a higher role than the one they hold; a person
   * who already holds this role or a higher one keeps it, so that an approval never lowers a role
   * someone gave meanwhile. The same rules as `give` apply.
   *
   * @param {GrantChange} change - The person, the role and their role in the organization.
   * @returns {GrantsUpdate} The grants after the change.
   * @throws {GranteeInvalidError} When the person is not a current member or guest.
   * @throws {OwnerUnchangeableError} When the person owns the space.
   * @throws {GuestSpaceForbiddenError} When a guest would receive a grant of a space.
   * @throws {GrantLimitReachedError} When a new grant would exceed 200.
   */
  public raise(change: GrantChange): GrantsUpdate {
    this.check(change);
    const current: GrantEntry | undefined = this.find(change.userId);
    if (current !== undefined && rankOf(current.role) >= rankOf(change.role)) {
      return { grants: this, changed: false, role: current.role };
    }
    return this.put(change.userId, change.role, current);
  }

  /**
   * Method remove
   *
   * @description
   * Removes the grant of a person ("Retirer l’accès"): they keep what the rule of the
   * organization or another grant gives them. A person without a grant changes nothing. The owner
   * of the space is refused, whether a grant exists or not: their access never changes.
   *
   * @param {string} userId - The person.
   * @returns {GrantsUpdate} The grants after the change.
   * @throws {OwnerUnchangeableError} When the person owns the space.
   */
  public remove(userId: string): GrantsUpdate {
    if (userId === this.state.ownerUserId) {
      throw new OwnerUnchangeableError();
    }
    if (this.find(userId) === undefined) {
      return { grants: this, changed: false, role: null };
    }
    return {
      grants: new ResourceGrants({
        ...this.state,
        grants: this.state.grants.filter((grant: GrantEntry): boolean => grant.userId !== userId),
      }),
      changed: true,
      role: null,
    };
  }

  /**
   * Method revoke
   *
   * @description
   * Removes the grant of a person who left the organization (the member clean-up of P3a extended
   * by P3b-1): unlike `remove`, it never refuses, so that a former member who became owner of the
   * space in a data race leaves no grant behind.
   *
   * @param {string} userId - The former member.
   * @returns {GrantsUpdate} The grants after the change.
   */
  public revoke(userId: string): GrantsUpdate {
    if (this.find(userId) === undefined) {
      return { grants: this, changed: false, role: null };
    }
    return {
      grants: new ResourceGrants({
        ...this.state,
        grants: this.state.grants.filter((grant: GrantEntry): boolean => grant.userId !== userId),
      }),
      changed: true,
      role: null,
    };
  }

  /**
   * Method check
   *
   * @description
   * Applies the rules of a new or changed grant, in the order of the contract examples: who the
   * person is first, then what the space allows them.
   *
   * @param {GrantChange} change - The grant to give.
   * @throws {GranteeInvalidError | OwnerUnchangeableError | GuestSpaceForbiddenError} When a rule
   * refuses it.
   */
  private check(change: GrantChange): void {
    if (!isAccessRole(change.role)) {
      throw new InvalidSpaceError('a grant gives edit, comment or view');
    }
    if (change.granteeRole === null) {
      throw new GranteeInvalidError(change.userId);
    }
    if (change.userId === this.state.ownerUserId) {
      throw new OwnerUnchangeableError();
    }
    if (this.state.resource === 'space' && change.granteeRole === 'guest') {
      throw new GuestSpaceForbiddenError();
    }
  }

  /**
   * Method put
   *
   * @description
   * Writes a role for a person, in place when they hold a grant, after the others otherwise.
   *
   * @param {string} userId - The person.
   * @param {AccessRole} role - The role.
   * @param {GrantEntry | undefined} current - Their current grant.
   * @returns {GrantsUpdate} The grants after the change.
   * @throws {GrantLimitReachedError} When a new grant would exceed 200.
   */
  private put(userId: string, role: AccessRole, current: GrantEntry | undefined): GrantsUpdate {
    if (current === undefined) {
      if (this.state.grants.length >= GRANT_LIMIT) {
        throw new GrantLimitReachedError();
      }
      return {
        grants: new ResourceGrants({
          ...this.state,
          grants: [...this.state.grants, { userId, role }],
        }),
        changed: true,
        role,
      };
    }
    return {
      grants: new ResourceGrants({
        ...this.state,
        grants: this.state.grants.map((grant: GrantEntry): GrantEntry =>
          grant.userId === userId ? { userId, role } : grant,
        ),
      }),
      changed: true,
      role,
    };
  }

  /**
   * Method find
   *
   * @description
   * The grant of a person, if any.
   *
   * @param {string} userId - The person.
   * @returns {GrantEntry | undefined} Their grant.
   */
  private find(userId: string): GrantEntry | undefined {
    return this.state.grants.find((grant: GrantEntry): boolean => grant.userId === userId);
  }
  // #endregion
}
