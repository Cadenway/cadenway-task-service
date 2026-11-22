import type { TaskTemplateDraft } from './task-template-draft.model.js';

/** Stored template with its library identity and revision. */
export interface TaskTemplateRecord extends Omit<TaskTemplateDraft, 'sourceListId'> {
  // #region Properties
  /** Database-assigned identifier. */
  readonly id: string;

  /** Library creation instant with millisecond precision. */
  readonly createdAt: string;

  /** Optimistic revision shared with the change event. */
  readonly version: number;
  // #endregion
}
