/** The verified member and task named by a contact read. */
export interface ResolveIntakeContactTaskInput {
  // #region Properties
  /** Tenant and caller from the verified request. */
  readonly organizationId: string;
  readonly actorUserId: string;

  /** The task key in the route. */
  readonly taskKey: string;
  // #endregion
}
