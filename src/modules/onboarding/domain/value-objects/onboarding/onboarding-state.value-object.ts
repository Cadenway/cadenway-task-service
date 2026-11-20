import type { OnboardingColor } from './onboarding-color.value-object.js';
import type { OnboardingPresetKey } from './onboarding-preset-key.value-object.js';

/** Wizard states defined in `components/onboarding.yaml`. */
export const ONBOARDING_STATUSES = ['in-progress', 'finished', 'dismissed'] as const;

/** Wizard screens in the mockup's first-launch flow. */
export const ONBOARDING_STEPS = ['space', 'preset', 'team', 'import'] as const;

/** Display states of the personal checklist. */
export const ONBOARDING_PRESENTATIONS = ['expanded', 'collapsed', 'dismissed'] as const;

/** The persisted wizard and checklist for one verified organization member. */
export interface OnboardingState {
  // #region Properties
  /** Organization in which the wizard is stored. */
  readonly organizationId: string;

  /** Verified member who owns the wizard and checklist. */
  readonly userId: string;

  /** Version for conditional writes, starting at one. */
  readonly version: number;

  /** Current draft choices and completion status. */
  readonly wizard: {
    readonly status: (typeof ONBOARDING_STATUSES)[number];
    readonly step: (typeof ONBOARDING_STEPS)[number];
    readonly preset: OnboardingPresetKey;
    readonly name: string | null;
    readonly prefix: string | null;
    readonly color: OnboardingColor;
  };

  /** The space and its first list after a successful finish. */
  readonly provisioning: {
    readonly spaceId: string;
    readonly firstListId: string;
  } | null;

  /** The three available action markers and checklist presentation. */
  readonly checklist: {
    readonly presentation: (typeof ONBOARDING_PRESENTATIONS)[number];
    readonly firstTaskCreated: boolean;
    readonly invitationSent: boolean;
    readonly boardTried: boolean;
  };
  // #endregion
}
