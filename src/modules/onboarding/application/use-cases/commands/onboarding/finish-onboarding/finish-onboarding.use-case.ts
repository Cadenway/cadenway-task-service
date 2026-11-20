import { getOnboardingPreset } from '../../../../../domain/policies/onboarding/onboarding-preset.policy.js';
import type { OnboardingActor } from '../../../../models/onboarding/onboarding-actor.model.js';
import type { OnboardingMembers } from '../../../../ports/outbound/membership/onboarding/onboarding-members.port.js';
import type { OnboardingProvisioner } from '../../../../ports/outbound/provisioning/onboarding/onboarding-provisioner.port.js';
import type { OnboardingUnitOfWork } from '../../../../ports/outbound/transactions/onboarding/onboarding-unit-of-work.port.js';
import { OnboardingAccess } from '../../../../services/onboarding/onboarding-access.service.js';
import { OnboardingStateService } from '../../../../services/onboarding/onboarding-state.service.js';
import type { FinishOnboardingInput } from './finish-onboarding.input.js';
import type { FinishOnboardingOutput } from './finish-onboarding.output.js';

/** Provisions a preset atomically with its ordinary creation events. */
export class FinishOnboarding {
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
    private readonly provisioner: OnboardingProvisioner,
  ) {
    this.access = new OnboardingAccess(members);
  }
  // #endregion

  // #region Methods
  /** Runs the requested operation. */
  public async execute(input: FinishOnboardingInput): Promise<FinishOnboardingOutput> {
    return this.work.run(async (repository) => {
      await this.access.require(input, true, true);
      const current = await this.states.lock(repository, input, input.expectedVersions);
      const plan = this.states.apply(() => current.planFinish(input.finish));
      const resources = await this.provisioner.provision(
        input.organizationId,
        input.actorUserId,
        plan,
        getOnboardingPreset(plan.preset),
      );
      const next = current.complete(plan, resources);
      await this.states.save(repository, current, next);
      return next.snapshot;
    });
  }

  /** Rechecks membership and the space-creation role before an idempotent replay. */
  public async assertCanReplay(input: OnboardingActor): Promise<void> {
    await this.work.runReadOnly(async () => this.access.require(input, false, true));
  }
  // #endregion
}
