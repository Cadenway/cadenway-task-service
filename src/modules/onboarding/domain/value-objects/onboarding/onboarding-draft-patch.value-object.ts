import type { OnboardingState } from './onboarding-state.value-object.js';

/** Updates supplied draft members, with explicit nulls clearing the name or prefix. */
export type OnboardingDraftPatch = Partial<Omit<OnboardingState['wizard'], 'status'>> & {
  readonly dismissed?: true;
};
