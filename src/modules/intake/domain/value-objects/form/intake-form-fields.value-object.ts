type FieldMode = 'disabled' | 'optional' | 'required';

/**
 * Modes of the configurable submission fields from `components/intake.yaml`. The title is
 * always available and required.
 */
export interface IntakeFormFields {
  // #region Properties
  /** Markdown task description field. */
  readonly description: FieldMode;

  /** Task priority field. */
  readonly priority: FieldMode;

  /** Task due date field. */
  readonly dueDate: FieldMode;

  /** Applicant contact field kept separate from the task. */
  readonly contactEmail: FieldMode;
  // #endregion
}
