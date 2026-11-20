/** Colors from the shared `LookColor` contract. */
export const ONBOARDING_COLORS = [
  'gris',
  'violet',
  'indigo',
  'azur',
  'lagon',
  'vert',
  'olive',
  'jaune',
  'orange',
  'rouge',
  'rose',
  'fuchsia',
  'ardoise',
] as const;

/** One of the space colors selectable in the onboarding wizard. */
export type OnboardingColor = (typeof ONBOARDING_COLORS)[number];
