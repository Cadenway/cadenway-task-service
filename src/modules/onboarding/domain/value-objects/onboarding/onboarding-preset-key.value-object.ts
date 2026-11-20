/** The preset choices listed in `components/onboarding.yaml`. */
export const ONBOARDING_PRESET_KEYS = ['dev', 'mkt', 'agency', 'blank'] as const;

/** The stable key of a preset that can provision a first space. */
export type OnboardingPresetKey = (typeof ONBOARDING_PRESET_KEYS)[number];
