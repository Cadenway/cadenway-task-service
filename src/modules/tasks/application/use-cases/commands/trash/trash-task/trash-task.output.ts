import type { TrashEntryView } from '../../../../projections/trash/trash-entry.projection.js';

/**
 * Type TrashTaskOutput
 *
 * @description
 * The entry the task and its subtasks make in the trash, so that "Annuler" restores it at once.
 */
export type TrashTaskOutput = TrashEntryView;
