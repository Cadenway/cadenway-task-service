/**
 * Constant MAX_ASSIGNEES
 *
 * @description
 * Assignees of a task, 20 at most (`openapi/public/tasks.yaml:35-36` and 57-60;
 * `openapi/internal/task-service.yaml:2191-2195`).
 *
 * @type {number}
 */
export const MAX_ASSIGNEES: number = 20;

/**
 * Constant MAX_LABELS
 *
 * @description
 * Labels of a task, 20 at most (`openapi/public/tasks.yaml:35-39` and 57-60;
 * `openapi/internal/task-service.yaml:2214-2218`).
 *
 * @type {number}
 */
export const MAX_LABELS: number = 20;

/**
 * Constant MAX_CHECKLIST_ITEMS
 *
 * @description
 * Items of a checklist, 100 at most (`openapi/public/tasks.yaml:41-43` and 57-60;
 * `openapi/internal/task-service.yaml:2232-2236`).
 *
 * @type {number}
 */
export const MAX_CHECKLIST_ITEMS: number = 100;

/**
 * Constant MAX_DIRECT_SUBTASKS
 *
 * @description
 * Direct subtasks of a task, 25 at most (`openapi/public/tasks.yaml:28-30` and 441-442).
 *
 * @type {number}
 */
export const MAX_DIRECT_SUBTASKS: number = 25;

/**
 * Constant MAX_LEVELS
 *
 * @description
 * Levels of a tree of tasks, 3 at most: task, subtask and sub-subtask
 * (`openapi/public/tasks.yaml:28-29`). A top-level task is at level 1.
 *
 * @type {number}
 */
export const MAX_LEVELS: number = 3;

/**
 * Constant COALESCING_WINDOW_MS
 *
 * @description
 * Window, in milliseconds, within which changes of the priority or the due date of a task by the
 * same actor merge into one activity entry (`openapi/public/tasks.yaml:46-48`;
 * `openapi/internal/task-service.yaml:676-678`).
 *
 * @type {number}
 */
export const COALESCING_WINDOW_MS: number = 60_000;

/**
 * Constant MAX_TASK_NUMBER
 *
 * @description
 * Largest number of a task key: the pattern `^[A-Z]{2,5}-[1-9][0-9]{0,8}$` of `TaskKey`
 * (`openapi/internal/task-service.yaml:3107-3109`) allows nine digits.
 *
 * @type {number}
 */
export const MAX_TASK_NUMBER: number = 999_999_999;

/**
 * Constant MAX_NAME_LENGTH
 *
 * @description
 * Characters of a task name once trimmed, 300 at most (`TaskName`,
 * `openapi/internal/task-service.yaml:3465-3473`).
 *
 * @type {number}
 */
export const MAX_NAME_LENGTH: number = 300;

/**
 * Constant MAX_DESCRIPTION_LENGTH
 *
 * @description
 * Characters of a description, 50,000 at most (`TaskDescription`,
 * `openapi/internal/task-service.yaml:3474-3479`).
 *
 * @type {number}
 */
export const MAX_DESCRIPTION_LENGTH: number = 50_000;

/**
 * Constant MAX_CANCEL_NOTE_LENGTH
 *
 * @description
 * Characters of a cancel note once trimmed, 500 at most (`TaskPatch.cancelNote`,
 * `openapi/internal/task-service.yaml:2550-2555`).
 *
 * @type {number}
 */
export const MAX_CANCEL_NOTE_LENGTH: number = 500;

/**
 * Constant MAX_LABEL_LENGTH
 *
 * @description
 * Characters of a label once trimmed, 32 at most (`LabelName`,
 * `openapi/internal/task-service.yaml:3500-3507`).
 *
 * @type {number}
 */
export const MAX_LABEL_LENGTH: number = 32;

/**
 * Constant MAX_CHECKLIST_TEXT_LENGTH
 *
 * @description
 * Characters of a checklist item once trimmed, 300 at most (`ChecklistItemCreation.text`,
 * `openapi/internal/task-service.yaml:2604-2610`).
 *
 * @type {number}
 */
export const MAX_CHECKLIST_TEXT_LENGTH: number = 300;

/**
 * Constant MAX_ESTIMATE_MINUTES
 *
 * @description
 * Largest estimate in whole minutes (`EstimateMinutes`,
 * `openapi/internal/task-service.yaml:3491-3499`).
 *
 * @type {number}
 */
export const MAX_ESTIMATE_MINUTES: number = 60_000;
