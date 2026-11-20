import type { OnboardingState } from './onboarding-state.value-object.js';

/** Saves checklist presentation and records completed actions available through this command. */
export interface OnboardingChecklistPatch {
  // #region Properties
  /** How the caller wants the checklist presented. */
  readonly presentation?: OnboardingState['checklist']['presentation'];

  /** Records success of the separate organization invitation flow. */
  readonly invitationSent?: true;

  /** Records that the caller tried the Board view. */
  readonly boardTried?: true;
  // #endregion
}
