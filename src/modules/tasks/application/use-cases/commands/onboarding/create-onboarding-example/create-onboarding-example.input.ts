/** Example to create with the ordinary task creation policies. */
export interface CreateOnboardingExampleInput {
  // #region Properties
  /** Verified organization and actor. */
  readonly organizationId: string;

  /** Verified actor account. */
  readonly actorUserId: string;

  /** Target list and mockup content. */
  readonly listId: string;

  /** Example title. */
  readonly name: string;

  /** Example description. */
  readonly description: string;

  /** Initial status of the example. */
  readonly status: 'todo' | 'progress';
  // #endregion
}
