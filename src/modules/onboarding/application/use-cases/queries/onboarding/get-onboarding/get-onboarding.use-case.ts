import type { OnboardingMembers } from '../../../../ports/outbound/membership/onboarding/onboarding-members.port.js';
import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { OnboardingAccess } from '../../../../services/onboarding/onboarding-access.service.js';
import { OnboardingStateService } from '../../../../services/onboarding/onboarding-state.service.js';
import type { GetOnboardingInput } from './get-onboarding.input.js';
import type { GetOnboardingOutput } from './get-onboarding.output.js';

/** Reads the caller's saved state or the version-one default. */
export class GetOnboarding {
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
  public async execute(input: GetOnboardingInput): Promise<GetOnboardingOutput> {
    return this.work.runReadOnly(async (repository) => {
      await this.access.require(input, false);
      return (await this.states.read(repository, input)).snapshot;
    });
  }
  // #endregion
}
