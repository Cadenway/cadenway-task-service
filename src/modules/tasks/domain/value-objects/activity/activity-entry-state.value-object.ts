import type { ActivityEntryDraft } from './activity-entry-draft.value-object.js';

/**
 * Interface ActivityEntryState
 *
 * @description
 * A stored activity entry (`ActivityEntry` of `openapi/internal/task-service.yaml:2622-2721`): the
 * members of its draft and its id, which a merge keeps.
 */
export interface ActivityEntryState extends ActivityEntryDraft {
  // #region Properties
  /**
   * Property id
   *
   * @description
   * Id of the entry.
   *
   * @type {string}
   * @readonly
   */
  readonly id: string;
  // #endregion
}
