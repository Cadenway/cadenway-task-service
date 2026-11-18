/**
 * Interface SubtreeShape
 *
 * @description
 * The shape of a task and its subtasks, all levels down, as the application reads it before the
 * task moves or attaches to a parent: what `subtask-tree.policy.ts` needs to keep 3 levels at
 * most and to refuse a parent among the descendants (`openapi/public/tasks.yaml:28-33` and
 * 437-442).
 */
export interface SubtreeShape {
  // #region Properties
  /**
   * Property taskId
   *
   * @description
   * Id of the task at the root of the subtree.
   *
   * @type {string}
   * @readonly
   */
  readonly taskId: string;

  /**
   * Property descendantIds
   *
   * @description
   * Ids of every subtask under the task, all levels down; empty for a task without subtasks.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly descendantIds: readonly string[];

  /**
   * Property height
   *
   * @description
   * Number of levels of the subtree, the task included: 1 without subtasks, 2 with subtasks, 3 with
   * sub-subtasks.
   *
   * @type {number}
   * @readonly
   */
  readonly height: number;
  // #endregion
}
