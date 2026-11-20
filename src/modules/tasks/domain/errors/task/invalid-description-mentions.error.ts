import { InvalidTaskError } from './invalid-task.error.js';

/** Refuses a description and its structured spans when their positions or text do not agree. */
export class InvalidDescriptionMentionsError extends InvalidTaskError {
  // #region Constructor
  /** Identifies the invalid field without carrying user-supplied content. */
  public constructor() {
    super('description mentions');
  }
  // #endregion
}
