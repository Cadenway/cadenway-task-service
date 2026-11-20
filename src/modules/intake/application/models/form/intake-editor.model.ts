import type { IntakeForm } from '../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeDefaultsEligibility } from '../../../domain/policies/form/intake-defaults-eligibility.policy.js';
import type { IntakeEditorContext } from '../../../domain/policies/form/intake-editor-context.policy.js';

/** A list, its effective editor rights and the current draft, all resolved in one transaction. */
export interface IntakeEditor {
  // #region Properties
  /** Provides access. */
  readonly access: IntakeEditorContext;

  /** Provides eligibility. */
  readonly eligibility: IntakeDefaultsEligibility;

  /** Provides form. */
  readonly form: IntakeForm | null;
  // #endregion
}
