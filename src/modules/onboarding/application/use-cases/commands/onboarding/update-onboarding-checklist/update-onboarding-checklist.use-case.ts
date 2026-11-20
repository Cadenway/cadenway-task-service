import type { OnboardingMembers } from '../../../../ports/outbound/membership/onboarding/onboarding-members.port.js';
import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { OnboardingAccess } from '../../../../services/onboarding/onboarding-access.service.js';
import { OnboardingStateService } from '../../../../services/onboarding/onboarding-state.service.js';
import type { UpdateOnboardingChecklistInput } from './update-onboarding-checklist.input.js';
import type { UpdateOnboardingChecklistOutput } from './update-onboarding-checklist.output.js';

/** Saves personal checklist presentation and available action markers. */
export class UpdateOnboardingChecklist {
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
  public async execute(
    input: UpdateOnboardingChecklistInput,
  ): Promise<UpdateOnboardingChecklistOutput> {
    return this.work.run(async (repository) => {
      await this.access.require(input, true);
      const current = await this.states.lock(repository, input, input.expectedVersions);
      const next = this.states.apply(() => current.patchChecklist(input.patch));
      await this.states.save(repository, current, next);
      return next.snapshot;
    });
  }
  // #endregion
}
