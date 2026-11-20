import type { OnboardingRepository } from '../../persistence/onboarding/onboarding-repository.port.js';

/** Opens or joins the tenant transaction shared with provisioning commands. */
export interface OnboardingUnitOfWork {
  // #region Methods
  /** Runs the requested operation. */
  run<TResult>(work: (onboarding: OnboardingRepository) => Promise<TResult>): Promise<TResult>;
  runReadOnly<TResult>(
    work: (onboarding: OnboardingRepository) => Promise<TResult>,
  ): Promise<TResult>;
  // #endregion
}
