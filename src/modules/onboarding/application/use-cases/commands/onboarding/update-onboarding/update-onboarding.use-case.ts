import type { OnboardingMembers } from '../../../../ports/outbound/membership/onboarding/onboarding-members.port.js';
import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { OnboardingAccess } from '../../../../services/onboarding/onboarding-access.service.js';
import { OnboardingStateService } from '../../../../services/onboarding/onboarding-state.service.js';
import type { UpdateOnboardingInput } from './update-onboarding.input.js';
import type { UpdateOnboardingOutput } from './update-onboarding.output.js';

/** Saves or dismisses the actor's wizard. */
export class UpdateOnboarding {
  // #region Properties
  /** State used by this operation. */
  private readonly access: OnboardingAccess;
  private readonly states = new OnboardingStateService();
  // #endregion

  // #region Constructor
  /** Initializes the operation. */
  public constructor(
    private readonly work: OnboardingUnitOfWork,
    members: OnboardingMembers,
  ) {
    this.access = new OnboardingAccess(members);
  }
  // #endregion

  // #region Methods
  /** Runs the requested operation. */
  public async execute(input: UpdateOnboardingInput): Promise<UpdateOnboardingOutput> {
    return this.work.run(async (repository) => {
      await this.access.require(input, true);
      const current = await this.states.lock(repository, input, input.expectedVersions);
      const next = this.states.apply(() => current.patchDraft(input.patch));
      await this.states.save(repository, current, next);
      return next.snapshot;
    });
  }
  // #endregion
}
