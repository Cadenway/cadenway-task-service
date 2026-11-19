/**
 * Interface TrashCandidateRoot
 *
 * @description
 * A task of a deleted list that roots one trash entry, as the deletion job reads it before its
 * locks ("one entry per top-level task with its subtasks", `openapi/public/trash.yaml`): a task out
 * of the trash that reads as top-level (no parent, or a parent in another list or in the trash),
 * live or archived. Its position orders the batches of the list.
 */
export interface TrashCandidateRoot {
  // #region Properties
  /** Id of the task. */
  readonly id: string;

  /** When it was created, the first member of the position. */
  readonly createdAt: Date;
  // #endregion
}
