import type { CommentTrashedTaskDetails } from './comment-trashed-task-details.model.js';

/** Refusal with the task's authorized trash details, shared by comment reads and writes. */
export class CommentTrashedTaskRefusal extends Error {
  // #region Constructor
  /** Retains only the details the owning task module disclosed to this caller. */
  public constructor(public readonly details: CommentTrashedTaskDetails) {
    super('The task is in the trash.');
  }
  // #endregion
}
