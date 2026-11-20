import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { OnboardingStateService } from '../../../../services/onboarding/onboarding-state.service.js';
import type { RecordFirstOnboardingTaskInput } from './record-first-onboarding-task.input.js';

/** Records the first ordinary task while the task's transaction is still open. */
export class RecordFirstOnboardingTask {
  // #region Properties
  /** Saves the aggregate with its locked version. */
  private readonly states = new OnboardingStateService();
  // #endregion

  // #region Constructor
  /** Binds the progress writer to the caller's transaction. */
  public constructor(private readonly work: Pick<OnboardingUnitOfWork, 'run'>) {}
  // #endregion

  // #region Methods
  /** Records a normal creation in the provisioned space, once. */
  public execute(input: RecordFirstOnboardingTaskInput): Promise<void> {
    return this.work.run(async (repository) => {
      const current = await repository.find(input.organizationId, input.actorUserId, true);
      if (current === null) return;
      const next = current.recordFirstTask({
        organizationId: input.organizationId,
        userId: input.actorUserId,
        spaceId: input.spaceId,
      });
      await this.states.save(repository, current, next);
    });
  }
  // #endregion
}
