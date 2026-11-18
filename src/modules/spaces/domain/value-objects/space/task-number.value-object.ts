/**
 * Constant MAX_TASK_NUMBER
 *
 * @description
 * The highest task number a prefix hands out: the number of a task key `<prefix>-<n>` has at most
 * nine digits and starts at 1 (`TaskKey` of `openapi/internal/task-service.yaml`, pattern
 * `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`).
 *
 * @type {number}
 */
export const MAX_TASK_NUMBER: number = 999_999_999;

/**
 * Function isTaskNumber
 *
 * @description
 * Whether a number can be the number of a task key: an integer from 1 to `MAX_TASK_NUMBER`. The
 * counter of a prefix is the last number given, so a counter above the bound means a key the
 * contract cannot express was about to be handed out.
 *
 * @param {number} value - The number.
 * @returns {boolean} Whether it is a valid task number.
 */
export function isTaskNumber(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_TASK_NUMBER;
}
