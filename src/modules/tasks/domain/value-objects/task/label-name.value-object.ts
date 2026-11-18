import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { MAX_LABEL_LENGTH } from './task-limits.value-object.js';

/**
 * Function normalizeLabelName
 *
 * @description
 * `LabelName` of `openapi/internal/task-service.yaml:3500-3507`: trimmed, 1 to 32 characters once
 * trimmed, counted in Unicode code points as `maxLength` counts them. The spelling is kept as
 * typed: the first spelling of a label is the one the task shows.
 *
 * @param {string} name - The label as typed.
 * @returns {string} The trimmed label.
 * @throws {InvalidTaskError} When the trimmed label is empty or longer than 32 characters.
 */
export function normalizeLabelName(name: string): string {
  const trimmed: string = name.trim();
  const length: number = Array.from(trimmed).length;
  if (length < 1 || length > MAX_LABEL_LENGTH) {
    throw new InvalidTaskError('a label has 1 to 32 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function labelKey
 *
 * @description
 * The key two labels are compared by: "two labels that differ only by case are the same label"
 * (`openapi/internal/task-service.yaml:3504-3505`; `openapi/public/tasks.yaml:57-60` and
 * 1138-1140, 1198). The trimmed label in Unicode normalization form C, then lower-cased; accents
 * stay significant, so "Sécurité" and "Securite" are two labels (open question 15 of the design).
 * Also the stored `task_labels.label_key`.
 *
 * @param {string} name - The label, trimmed or not.
 * @returns {string} Its key.
 */
export function labelKey(name: string): string {
  return name.trim().normalize('NFC').toLowerCase();
}
