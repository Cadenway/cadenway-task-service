import type { RecordFirstOnboardingTaskInput } from './record-first-onboarding-task.input.js';

/** Records the first ordinary task while the task's transaction is still open. */
export class RecordFirstOnboardingTask {
  // #region Constructor
  /** Binds the progress writer to the caller's transaction. */
  public constructor(
    private readonly write: (input: RecordFirstOnboardingTaskInput) => Promise<void>,
  ) {}
  // #endregion

  // #region Methods
  /** Records a normal creation in the provisioned space, once. */
  public execute(input: RecordFirstOnboardingTaskInput): Promise<void> {
    return this.write(input);
  }
  // #endregion
}
