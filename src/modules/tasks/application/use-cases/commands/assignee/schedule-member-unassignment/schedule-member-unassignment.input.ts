/**
 * Interface ScheduleMemberUnassignmentInput
 *
 * @description
 * The member who left an organization, as `member.removed.v1` names them, with the membership that
 * ended and its version after the removal, which together identify the removal. There is no actor:
 * the unassignment is made by task-service itself.
 */
export interface ScheduleMemberUnassignmentInput {
  // #region Properties
  /** The organization of the event, the one of the transaction. */
  readonly organizationId: string;

  /** The account of the member who left. */
  readonly userId: string;

  /** The membership that ended. */
  readonly memberId: string;

  /** The version of that membership after the removal. */
  readonly membershipVersion: number;
  // #endregion
}
