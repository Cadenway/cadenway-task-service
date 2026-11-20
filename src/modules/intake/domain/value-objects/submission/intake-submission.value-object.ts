import type { IntakeStatus } from '../form/intake-status.value-object.js';

/** Ordinary task content and a separate contact, as required by the P3c brief, decision 11. */
export interface IntakeSubmission {
  // #region Properties
  /** Validated inputs for the normal task creation path. */
  readonly task: {
    readonly title: string;
    readonly description: string | null;
    readonly priority: 'urgente' | 'haute' | 'moyenne' | 'basse';
    readonly dueDate: string | null;
    readonly status: IntakeStatus;
    readonly assigneeId: string | null;
  };

  /** Separate contact data available to an editor. */
  readonly contactEmail: string | null;
  // #endregion
}
