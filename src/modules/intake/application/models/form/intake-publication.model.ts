import type { IntakeForm } from '../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakePublicationContext } from '../../../domain/policies/form/intake-publication-context.policy.js';

/** The current publication and its locked list and defaults. */
export interface IntakePublication {
  // #region Properties
  /** Provides form. */
  readonly form: IntakeForm;

  /** Provides context. */
  readonly context: IntakePublicationContext;
  // #endregion
}
