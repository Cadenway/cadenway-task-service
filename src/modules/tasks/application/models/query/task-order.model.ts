/**
 * Interface TaskOrder
 *
 * @description
 * The `sort` of the tasks of a list (`openapi/public/tasks.yaml:229-233`): the key, and whether a
 * leading `-` reverses it. Ties follow the order of the list, which in this version is the order
 * of creation.
 */
export interface TaskOrder {
  // #region Properties
  /** What the tasks are ordered by; `manual` is the order of the list, as `createdAt`. */
  readonly key: 'manual' | 'dueDate' | 'priority' | 'name' | 'createdAt';

  /** `true` for the reversed order (`-` before the key). */
  readonly descending: boolean;
  // #endregion
}
