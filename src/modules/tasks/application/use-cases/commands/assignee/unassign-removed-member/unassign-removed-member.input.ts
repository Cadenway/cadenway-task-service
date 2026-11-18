/**
 * Interface UnassignRemovedMemberInput
 *
 * @description
 * The member who left an organization, as `member.removed.v1` names them. There is no actor: the
 * change is made by task-service itself.
 */
export interface UnassignRemovedMemberInput {
  // #region Properties
  /** The organization of the event. */
  readonly organizationId: string;

  /** The account of the member who left. */
  readonly userId: string;
  // #endregion
}
