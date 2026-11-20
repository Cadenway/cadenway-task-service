import type { OnboardingDraftPatch } from '../../../../../domain/value-objects/onboarding/onboarding-draft-patch.value-object.js';
import type { OnboardingActor } from '../../../../models/onboarding/onboarding-actor.model.js';

/** A conditional change to the personal wizard draft. */
export interface UpdateOnboardingInput extends OnboardingActor {
  // #region Properties
  /** State used by this operation. */
  readonly expectedVersions: readonly number[] | null;
  readonly patch: OnboardingDraftPatch;
  // #endregion
}
