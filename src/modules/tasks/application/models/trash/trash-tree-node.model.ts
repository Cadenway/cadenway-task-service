/**
 * Interface TrashTreeNode
 *
 * @description
 * One task of the tree of the root of a trash entry, as the recursive read of the trees gives it
 * before the locks or under them: the task, its root and its depth under that root.
 */
export interface TrashTreeNode {
  // #region Properties
  /** Id of the task. */
  readonly id: string;

  /** Id of the root of its tree. */
  readonly rootId: string;

  /** Its depth under the root: 0 for the root. */
  readonly depth: number;
  // #endregion
}
