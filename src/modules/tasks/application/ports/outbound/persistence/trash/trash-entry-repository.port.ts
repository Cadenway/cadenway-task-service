import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { TrashHandOver } from '../../../../../domain/value-objects/trash/trash-hand-over.value-object.js';
import type { TrashEntryDraft } from '../../../../models/trash/trash-entry-draft.model.js';
import type { TrashEntryRecord } from '../../../../models/trash/trash-entry-record.model.js';
import type { TrashPosition } from '../../../../models/trash/trash-position.model.js';

/**
 * Interface TrashEntryRepository
 *
 * @description
 * The trash entries of the tenant transaction (`trash_entries`), each read with the key, name and
 * status of its root. Every method filters on the organization. An entry is in the trash until
 * "Vider la corbeille" hands it to the purge (`purgeRequest`); the page, its total and the
 * hand-over read the entries still in the trash only. Locks are `FOR UPDATE` and last until the
 * commit; an entry row is locked after the memberships and before its tasks.
 */
export interface TrashEntryRepository {
  // #region Methods
  /**
   * Method insertMany
   *
   * @description
   * Stores new entries in one statement; PostgreSQL gives their ids.
   *
   * @param {readonly TrashEntryDraft[]} drafts - The entries, one per root.
   * @returns {Promise<readonly TrashEntryRecord[]>} The stored entries, in the order of the drafts.
   */
  insertMany(drafts: readonly TrashEntryDraft[]): Promise<readonly TrashEntryRecord[]>;

  /**
   * Method find
   *
   * @description
   * Reads an entry by id without a lock, in the trash or handed over.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null` when the organization has none.
   */
  find(organizationId: string, entryId: string): Promise<TrashEntryRecord | null>;

  /**
   * Method lock
   *
   * @description
   * Locks an entry `FOR UPDATE` and reads it after the lock: a restoration or an erasure of the
   * same entry waits, then finds it gone.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null` when it is gone.
   */
  lock(organizationId: string, entryId: string): Promise<TrashEntryRecord | null>;

  /**
   * Method pageOfLists
   *
   * @description
   * Reads a page of the entries of some lists still in the trash, the most recently deleted first
   * (`trashed_at desc, id desc`), strictly after a position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
   * @param {TrashPosition | null} after - The last entry of the previous page, `null` for the first.
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries.
   */
  pageOfLists(
    organizationId: string,
    listIds: readonly string[],
    after: TrashPosition | null,
    limit: number,
  ): Promise<readonly TrashEntryRecord[]>;

  /**
   * Method countOfLists
   *
   * @description
   * Counts the entries of some lists still in the trash, with the condition of the page.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<number>} The count.
   */
  countOfLists(organizationId: string, listIds: readonly string[]): Promise<number>;

  /**
   * Method requestPurge
   *
   * @description
   * Hands the entries of some lists still in the trash to the purge job ("Vider la corbeille"), in
   * one statement: their `purge_requested_*` become the instant and the actor.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor may restore the entries of.
   * @param {Date} at - The transaction instant.
   * @param {TaskActor} by - Who asked.
   * @returns {Promise<number>} How many entries left the trash.
   */
  requestPurge(
    organizationId: string,
    listIds: readonly string[],
    at: Date,
    by: TaskActor,
  ): Promise<number>;

  /**
   * Method lockHandedOver
   *
   * @description
   * Locks the oldest entries "Vider la corbeille" handed to the purge (`purge_requested_at`, then
   * id), `FOR UPDATE SKIP LOCKED`, so that two purge jobs of one organization share them.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, oldest first.
   */
  lockHandedOver(organizationId: string, limit: number): Promise<readonly TrashEntryRecord[]>;

  /**
   * Method lockDue
   *
   * @description
   * Locks the oldest entries still in the trash whose purge date passed (deleted at or before
   * `dueBefore`), by deletion instant then id, `FOR UPDATE SKIP LOCKED`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Date} dueBefore - The latest deletion instant that is due (`purgeDueBefore`).
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, oldest first.
   */
  lockDue(
    organizationId: string,
    dueBefore: Date,
    limit: number,
  ): Promise<readonly TrashEntryRecord[]>;

  /**
   * Method erase
   *
   * @description
   * Erases entries for good with their tasks, which the caller holds locked, set-based: the
   * activity entries, checklist items, assignees and labels of their tasks; the tasks outside the
   * entries whose parent is one of their tasks detached (`parent_id` null, no version, no event:
   * tasks of other entries, and archived tasks out of the trash left in another list when their
   * parent moved away); their tasks; the entries.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} entryIds - The entries.
   * @returns {Promise<void>} Resolves once erased.
   */
  erase(organizationId: string, entryIds: readonly string[]): Promise<void>;

  /**
   * Method erasePart
   *
   * @description
   * Erases some tasks of one entry for good, which the caller holds locked with the entry, in the
   * statements of `erase` scoped to those tasks: their activity entries, checklist items, assignees
   * and labels; the tasks outside them whose parent is one of them detached (`parent_id` null, no
   * version, no event); the tasks. The entry row stays, its `task_count` less the tasks erased,
   * and is handed to the purge with `handOver` when it was still in the trash (a hand-over keeps
   * its requester), so it is out of the trash from its first part on.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @param {readonly string[]} taskIds - The tasks to erase, fewer than the entry holds.
   * @param {TrashHandOver} handOver - The hand-over set on an entry still in the trash.
   * @returns {Promise<void>} Resolves once erased.
   * @throws {Error} When a task or the entry vanished, which their locks prevent.
   */
  erasePart(
    organizationId: string,
    entryId: string,
    taskIds: readonly string[],
    handOver: TrashHandOver,
  ): Promise<void>;

  /**
   * Method remove
   *
   * @description
   * Deletes the row of an entry whose tasks were restored (none references it any more).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<void>} Resolves once deleted.
   * @throws {Error} When the entry is gone, which its lock prevents.
   */
  remove(organizationId: string, entryId: string): Promise<void>;
  // #endregion
}
