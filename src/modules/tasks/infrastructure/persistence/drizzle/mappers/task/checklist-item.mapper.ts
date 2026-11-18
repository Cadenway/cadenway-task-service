import type { ChecklistItemState } from '../../../../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { checklistItems } from '../../schemas/checklist/checklist-item.schema.js';

/**
 * Type ChecklistItemRow
 *
 * @description
 * A row of `checklist_items`.
 *
 * @type {typeof checklistItems.$inferSelect}
 */
export type ChecklistItemRow = typeof checklistItems.$inferSelect;

/**
 * Function toChecklistItem
 *
 * @description
 * Maps a row to the item it stores. The domain checks the text and the order when it restores the
 * task that holds the item.
 *
 * @param {ChecklistItemRow} row - The row.
 * @returns {ChecklistItemState} The item.
 */
export function toChecklistItem(row: ChecklistItemRow): ChecklistItemState {
  return { id: row.id, text: row.text, done: row.done, position: row.position };
}
