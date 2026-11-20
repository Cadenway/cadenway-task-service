import type { OnboardingColor } from './onboarding-color.value-object.js';
import type { OnboardingPresetKey } from './onboarding-preset-key.value-object.js';

/** The name, explicit prefix and preset used to provision the first space. */
export interface OnboardingFinishInput {
  // #region Properties
  /** Display name passed to the ordinary space creation command. */
  readonly name: string;

  /** Explicit prefix reserved by the ordinary space creation command. */
  readonly prefix: string;

  /** Preset whose lists and examples will be created. */
  readonly preset: OnboardingPresetKey;

  /** Space color, with the finish command defaulting to violet. */
  readonly color?: OnboardingColor;
  // #endregion
}
