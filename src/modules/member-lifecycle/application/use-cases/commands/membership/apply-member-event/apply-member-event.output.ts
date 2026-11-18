/**
 * Interface ApplyMemberEventOutput
 *
 * @description
 * What a member event did beyond the copy of the memberships.
 */
export interface ApplyMemberEventOutput {
  // #region Properties
  /**
   * Property cleanUpEnqueued
   *
   * @description
   * For a removal: `true` when it enqueued the clean-up job of the former member, `false` when the
   * same removal had already enqueued it; `false` for the other events.
   *
   * @type {boolean}
   * @readonly
   */
  readonly cleanUpEnqueued: boolean;
  // #endregion
}
