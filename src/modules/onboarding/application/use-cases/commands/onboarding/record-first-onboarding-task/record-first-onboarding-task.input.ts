/** The creator and placement already authorized by the task module. */
export interface RecordFirstOnboardingTaskInput {
  // #region Properties
  /** Identifies the member's space in the verified organization. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly spaceId: string;
  // #endregion
}
