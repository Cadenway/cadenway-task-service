/** Applicant-supplied fields from `components/intake.yaml`, before checking the current modes. */
export interface IntakeSubmissionInput {
  // #region Properties
  /** Required task title. */
  readonly title: string;

  /** Optional task description in Markdown. */
  readonly description?: string | null;

  /** Optional task priority key. */
  readonly priority?: string | null;

  /** Optional task due date in calendar days. */
  readonly dueDate?: string | null;

  /** Optional applicant contact information. */
  readonly contactEmail?: string | null;

  /** Optional UUIDv7 selection from the applicant's live draft. */
  readonly attachmentIds?: readonly string[];
  // #endregion
}
