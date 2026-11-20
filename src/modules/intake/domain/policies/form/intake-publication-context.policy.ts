import type { IntakeDefaultsEligibility } from './intake-defaults-eligibility.policy.js';

/** Conditions for an anonymous action on the key's owning list, per the P3c brief, decision 11. */
export interface IntakePublicationContext {
  // #region Properties
  /** Opaque key presented by the applicant. */
  readonly key: string;

  /** Current state of the owning list. */
  readonly lifecycle: 'active' | 'archived' | 'removed';

  /** Current eligibility of the published task defaults. */
  readonly eligibility: IntakeDefaultsEligibility;
  // #endregion
}
