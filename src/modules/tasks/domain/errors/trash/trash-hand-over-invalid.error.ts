import { DomainError } from '../task/domain.error.js';

/**
 * Class TrashHandOverInvalidError
 *
 * @description
 * A stored hand-over of a trash entry to the purge that no "Vider la corbeille" can produce: its
 * instant and its actor are set together, or not at all (`trash_entries_purge_requested_check`).
 * Reading one is a defect.
 */
export class TrashHandOverInvalidError extends DomainError {
  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Names the entry whose hand-over is set in part only.
   *
   * @param {string} entryId - The entry.
   * @constructor
   */
  public constructor(entryId: string) {
    super(`The hand-over to the purge of the trash entry ${entryId} is set in part only.`);
  }
  // #endregion
}
