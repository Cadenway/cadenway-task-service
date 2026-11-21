/** A task command result recorded alongside the idempotency receipt. */
export interface ApplyAutomationTaskActionOutput {
  // #region Properties
  /** Whether the domain action changed the task. */
  readonly disposition: 'applied' | 'no_op';
  // #endregion
}
