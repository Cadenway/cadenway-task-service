/** Content-free approval refusal for mapping to the internal problem contract. */
export class ApprovalRefusal extends Error {
  // #region Constructor
  /** Records the content-free refusal reason. */
  public constructor(
    public readonly reason:
      | 'round-not-found'
      | 'milestone-unsupported'
      | 'reviewer-invalid'
      | 'reviewer-required'
      | 'vote-already-recorded'
      | 'invalid-reason',
  ) {
    super(reason);
    this.name = 'ApprovalRefusal';
  }
  // #endregion
}
