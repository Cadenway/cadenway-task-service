import { DomainError } from './domain.error.js';

/** A refusal of an onboarding draft, checklist change, finish or stored snapshot. */
export class OnboardingError extends DomainError {
  // #region Constructor
  /** Names the reason the application can map to the onboarding contract. */
  public constructor(
    public readonly reason:
      'wizard-closed' | 'checklist-unavailable' | 'invalid-draft' | 'invalid-state',
  ) {
    super(`Onboarding refused the operation (${reason}).`);
  }
  // #endregion
}
