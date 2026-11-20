import type { IntakeFormFields } from './intake-form-fields.value-object.js';
import type { IntakeStatus } from './intake-status.value-object.js';

/** Persisted draft and current publication, as specified in `components/intake.yaml`. */
export interface IntakeFormConfiguration {
  // #region Properties
  /** Public heading shown to applicants. */
  readonly title: string;

  /** Optional public instructions. */
  readonly description: string | null;

  /** Current availability of each configurable field. */
  readonly fields: IntakeFormFields;

  /** Initial workflow status for a task submitted through the form. */
  readonly defaultStatus: IntakeStatus;

  /** Eligible account assigned to new submissions, or null. */
  readonly defaultAssigneeId: string | null;

  /** Opaque publication key, or null when the form is disabled. */
  readonly publicKey: string | null;

  /** Version checked by management actions. */
  readonly version: number;
  // #endregion
}
