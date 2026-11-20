import type { ActivityEntryDraft } from '../../../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityKind } from '../../../../../domain/value-objects/activity/activity-kind.value-object.js';
import type { ActivityPosition } from '../../../../models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../../../../models/activity/list-activity-filter.model.js';

/**
 * Interface ActivityRepository
 *
 * @description
 * The activity entries of the tenant transaction. Every method filters on the organization. Pages
 * are most recent first (`occurred_at DESC, id DESC`).
 */
export interface ActivityRepository {
  // #region Methods
  /**
   * Method latestOfKind
   *
   * @description
   * Finds the latest entry of a kind for a task, whoever made it: the candidate of a merge. The
   * caller holds the lock of the task, which serializes the merges.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {ActivityKind} kind - The kind.
   * @returns {Promise<ActivityEntryState | null>} The entry, or `null` when the task has none.
   */
  latestOfKind(
    organizationId: string,
    taskId: string,
    kind: ActivityKind,
  ): Promise<ActivityEntryState | null>;

  /**
   * Method insert
   *
   * @description
   * Stores new entries in one statement; the database gives their ids.
   *
   * @param {readonly ActivityEntryDraft[]} drafts - The entries.
   * @returns {Promise<void>} Resolves once stored.
   */
  insert(drafts: readonly ActivityEntryDraft[]): Promise<void>;

  /**
   * Method update
   *
   * @description
   * Rewrites the detail and the instant of an entry that absorbed a change.
   *
   * @param {ActivityEntryState} entry - The merged entry.
   * @returns {Promise<void>} Resolves once written.
   */
  update(entry: ActivityEntryState): Promise<void>;

  /**
   * Method remove
   *
   * @description
   * Deletes an entry whose merged change came back to where it started.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<void>} Resolves once deleted.
   */
  remove(organizationId: string, entryId: string): Promise<void>;

  /** Updates the excerpt or removes a comment activity while its task is locked. */
  changeComment(
    organizationId: string,
    taskId: string,
    commentId: string,
    excerpt: string | null,
  ): Promise<void>;

  /**
   * Method pageOfTask
   *
   * @description
   * Reads a page of the entries of a task.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {readonly ActivityKind[] | null} kinds - The kinds to keep, `null` for all.
   * @param {ActivityPosition | null} after - The last entry of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ActivityEntryState[]>} The entries.
   */
  pageOfTask(
    organizationId: string,
    taskId: string,
    kinds: readonly ActivityKind[] | null,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly ActivityEntryState[]>;

  /**
   * Method countOfTask
   *
   * @description
   * Counts the entries of a task that match the kinds.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} taskId - The task.
   * @param {readonly ActivityKind[] | null} kinds - The kinds to keep, `null` for all.
   * @returns {Promise<number>} The count.
   */
  countOfTask(
    organizationId: string,
    taskId: string,
    kinds: readonly ActivityKind[] | null,
  ): Promise<number>;

  /**
   * Method pageOfList
   *
   * @description
   * Reads a page of the entries recorded while their task was in a list, left out when the task is
   * now in a list that is not in `filter.listIds`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {ListActivityFilter} filter - The list, the visible lists and the filters.
   * @param {ActivityPosition | null} after - The last entry of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ActivityEntryState[]>} The entries.
   */
  pageOfList(
    organizationId: string,
    filter: ListActivityFilter,
    after: ActivityPosition | null,
    limit: number,
  ): Promise<readonly ActivityEntryState[]>;

  /**
   * Method countOfList
   *
   * @description
   * Counts the entries `pageOfList` reads, whatever the page.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {ListActivityFilter} filter - The list, the visible lists and the filters.
   * @returns {Promise<number>} The count.
   */
  countOfList(organizationId: string, filter: ListActivityFilter): Promise<number>;
  // #endregion
}
