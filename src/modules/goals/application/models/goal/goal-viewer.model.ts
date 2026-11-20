/** Current organization membership used to authorize goal operations. */
export interface GoalViewer {
  // #region Properties
  /** The members of this application contract. */
  readonly organizationId: string;
  readonly userId: string;
  readonly role: 'owner' | 'admin' | 'member' | 'guest';
  // #endregion
}
