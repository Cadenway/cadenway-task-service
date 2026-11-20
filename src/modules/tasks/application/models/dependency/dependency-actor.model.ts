/** The verified caller and anchor of a dependency operation. */
export interface DependencyActor {
  // #region Properties
  /** Organization from the trusted request context. */
  readonly organizationId: string;

  /** Account of the actor from the trusted request context. */
  readonly actorUserId: string;

  /** Key of the task named by the request path. */
  readonly taskKey: string;
  // #endregion
}
