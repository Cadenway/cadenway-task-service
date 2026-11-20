/** A task policy refusal made portable to the task-approvals capability. */
export class TaskApprovalTaskRefusal extends Error {
  // #region Constructor
  /** Keeps the task refusal's stable reason and authorized, serializable details. */
  public constructor(
    public readonly reason: string,
    public readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(`The task approval was refused: ${reason}.`);
    this.name = 'TaskApprovalTaskRefusal';
  }
  // #endregion
}
