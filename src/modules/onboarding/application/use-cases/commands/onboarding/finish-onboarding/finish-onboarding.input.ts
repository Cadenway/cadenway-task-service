import type { OnboardingFinishInput } from '../../../../../domain/value-objects/onboarding/onboarding-finish-input.value-object.js';
import type { OnboardingActor } from '../../../../models/onboarding/onboarding-actor.model.js';

/** A conditional first-space provisioning request. */
export interface FinishOnboardingInput extends OnboardingActor {
  // #region Properties
  /** State used by this operation. */
  readonly expectedVersions: readonly number[] | null;
  readonly finish: OnboardingFinishInput;
  // #endregion
}
