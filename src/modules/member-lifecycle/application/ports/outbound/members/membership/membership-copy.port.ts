import type { ApplyMemberEventInput } from '../../../../use-cases/commands/membership/apply-member-event/apply-member-event.input.js';

/**
 * Interface MembershipCopy
 *
 * @description
 * The copy of the memberships of organization-service that the organization-members module keeps,
 * as the member lifecycle drives it. Called inside the tenant transaction the deduplicator of the
 * kit opened for the organization of the event, which it joins.
 */
export interface MembershipCopy {
  // #region Methods
  /**
   * Method apply
   *
   * @description
   * Applies one member event to the copy by the version of the membership: an event applied twice,
   * or older than the copy, changes nothing, and a removal stays applied.
   *
   * @param {ApplyMemberEventInput} change - The member event.
   * @returns {Promise<void>} Resolves once applied, or at once when it changes nothing.
   * @throws {Error} When the copy refuses the event (a membership that names another account) or
   * PostgreSQL fails: the transaction rolls back and the kit redelivers the event.
   */
  apply(change: ApplyMemberEventInput): Promise<void>;
  // #endregion
}
