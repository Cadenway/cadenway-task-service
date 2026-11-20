import type { OnboardingFinishInput } from '../../../../../domain/value-objects/onboarding/onboarding-finish-input.value-object.js';
import type { OnboardingPreset } from '../../../../../domain/value-objects/onboarding/onboarding-preset.value-object.js';

/** Provisions with ordinary commands, joining the caller's transaction and outbox. */
export interface OnboardingProvisioner {
  // #region Methods
  /** Runs the requested operation. */
  provision(
    organizationId: string,
    actorUserId: string,
    plan: Required<OnboardingFinishInput>,
    preset: OnboardingPreset,
  ): Promise<{ readonly spaceId: string; readonly firstListId: string }>;
  // #endregion
}
