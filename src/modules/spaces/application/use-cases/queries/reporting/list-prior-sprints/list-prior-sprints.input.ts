/** A caller and the date bounds for the previous completed sprints of a space. */
export interface ListPriorSprintsInput {
  // #region Properties
  /** Tenant and member resolved by the report within its current transaction. */
  readonly organizationId: string;
  readonly viewerUserId: string;
  readonly viewerRole: 'owner' | 'admin' | 'member' | 'guest';

  /** The current sprint's space and start date in the report time zone. */
  readonly spaceId: string;
  readonly beforeStartDate: string;

  /**
   * Last local date whose end precedes or equals the server observation instant.
   * Null means no completed local date is representable.
   */
  readonly completedThroughDate: string | null;
  // #endregion
}
