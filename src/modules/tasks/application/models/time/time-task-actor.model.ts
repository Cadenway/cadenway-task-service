/** A task request authenticated by the internal token. */
export interface TimeTaskActor {
  // #region Properties
  /** The stored value. */
  readonly organizationId: string;
  readonly actorUserId: string;
  readonly taskKey: string;
  // #endregion
}
