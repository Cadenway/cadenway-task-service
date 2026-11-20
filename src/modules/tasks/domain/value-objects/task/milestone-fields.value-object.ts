import type { StatusKey } from './status-key.value-object.js';

/** Task fields that participate in milestone normalization (P3b-2 decision 11). */
export interface MilestoneFields {
  // #region Properties
  /** Whether the task represents a milestone. */
  readonly milestone: boolean;

  /** Current workflow status. */
  readonly status: StatusKey;

  /** Calendar date of the milestone, or no date. */
  readonly dueDate: string | null;

  /** Calendar start date, which equals the due date for milestones. */
  readonly startDate: string | null;

  /** Estimate in whole minutes, always absent for milestones. */
  readonly estimateMinutes: number | null;
  // #endregion
}
