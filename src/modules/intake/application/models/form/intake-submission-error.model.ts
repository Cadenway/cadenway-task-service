/** A refusal of the applicant's idempotency key without disclosing form data. */
export class IntakeSubmissionError extends Error {
  // #region Constructor
  /** Binds the transaction boundary. */
  public constructor(public readonly reason: 'in-progress' | 'key-reused') {
    super('The intake submission idempotency key was refused.');
    this.name = 'IntakeSubmissionError';
  }
  // #endregion
}
