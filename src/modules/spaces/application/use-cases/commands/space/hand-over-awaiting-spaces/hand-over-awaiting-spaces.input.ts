/**
 * Interface HandOverAwaitingSpacesInput
 *
 * @description
 * An organization whose owner the copy of the memberships has just learnt (a `member.joined.v1` or
 * `member.role-changed.v1` with the role `owner`).
 */
export interface HandOverAwaitingSpacesInput {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the event, the one of its tenant transaction.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;
  // #endregion
}
