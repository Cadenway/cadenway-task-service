/** A refusal from the task that owns the approval's visibility, version and status. */
export class ApprovalTaskRefusal extends Error {
  // #region Constructor
  /** Carries the task's stable reason and the safe details it declared. */
  public constructor(
    public readonly reason: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(reason);
    this.name = 'ApprovalTaskRefusal';
  }
  // #endregion
}
