/** Denies a library request with the stable error code and details of the contract. */
export class TaskTemplateRefusal extends Error {
  // #region Constructor
  /** Carries the error through the tenant transaction until mapped at the HTTP boundary. */
  public constructor(
    public readonly status: 403 | 404 | 409 | 412 | 422,
    public readonly code: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(code);
    this.name = 'TaskTemplateRefusal';
  }
  // #endregion
}
