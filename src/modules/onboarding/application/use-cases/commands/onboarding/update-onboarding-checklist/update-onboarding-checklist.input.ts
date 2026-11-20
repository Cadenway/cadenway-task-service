import type { OnboardingChecklistPatch } from '../../../../../domain/value-objects/onboarding/onboarding-checklist-patch.value-object.js';
import type { OnboardingActor } from '../../../../models/onboarding/onboarding-actor.model.js';

/** A conditional checklist presentation or marker update. */
export interface UpdateOnboardingChecklistInput extends OnboardingActor {
  // #region Properties
  /** State used by this operation. */
  readonly expectedVersions: readonly number[] | null;
  readonly patch: OnboardingChecklistPatch;
  // #endregion
}
