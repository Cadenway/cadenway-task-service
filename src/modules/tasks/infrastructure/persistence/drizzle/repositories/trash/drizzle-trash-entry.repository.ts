import type { TransactionDatabase } from '@cadenway/nest-common/database';
import type { SQL } from 'drizzle-orm';

import type { TrashEntryDraft } from '../../../../../application/models/trash/trash-entry-draft.model.js';
import type { TrashEntryRecord } from '../../../../../application/models/trash/trash-entry-record.model.js';
import type { TrashPosition } from '../../../../../application/models/trash/trash-position.model.js';
import type { TrashEntryRepository } from '../../../../../application/ports/outbound/persistence/trash/trash-entry-repository.port.js';
import type { TaskActor } from '../../../../../domain/value-objects/task/task-actor.value-object.js';
import type { RawTrashEntryRow } from '../../mappers/trash/raw-trash-entry-row.mapper.js';
import { toTrashEntryRecord } from '../../mappers/trash/trash-entry.mapper.js';
import {
  dueEntriesStatement,
  eraseEntriesStatements,
  handedOverEntriesStatement,
  insertEntriesStatement,
  removeEntryStatement,
  lockInTrashOfListsStatement,
  requestPurgeStatement,
  trashEntryStatement,
  trashPageStatement,
  trashTotalStatement,
} from '../../mappers/trash/trash-statements.mapper.js';

/**
 * Class DrizzleTrashEntryRepository
 *
 * @description
 * `TrashEntryRepository` on `trash_entries` (and, for an erasure, on the task tables), in the
 * transaction of its unit of work. Every statement names `organization_id`, the first column of
 * every key and index it reads; row-level security is the second barrier. An entry is read with
 * its root by the primary key of `tasks`. The page and its total read `trash_entries_trashed_index`
 * (the entries still in the trash), the hand-over to the purge `trash_entries_purge_requested_index`;
 * the locks are `FOR UPDATE` of the entry row only, `SKIP LOCKED` for the batches of the purge. An
 * erasure is seven set-based statements whatever the number of entries and tasks.
 */
export class DrizzleTrashEntryRepository implements TrashEntryRepository {
  // #region Properties
  /**
   * Property db
   *
   * @description
   * The Drizzle database of the transaction.
   *
   * @type {TransactionDatabase}
   * @readonly
   */
  private readonly db: TransactionDatabase;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the repository to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
  }
  // #endregion

  // #region Methods
  /**
   * Method insertMany
   *
   * @description
   * Stores the entries in one statement (`insertEntriesStatement`) and matches the rows to the
   * drafts by their root, each root rooting one entry of the call.
   *
   * @param {readonly TrashEntryDraft[]} drafts - The entries.
   * @returns {Promise<readonly TrashEntryRecord[]>} The stored entries, in the order of the drafts.
   * @throws {Error} When no row came back for a draft.
   */
  public async insertMany(
    drafts: readonly TrashEntryDraft[],
  ): Promise<readonly TrashEntryRecord[]> {
    if (drafts.length === 0) {
      return [];
    }
    const result = await this.db.execute<RawTrashEntryRow & Record<string, unknown>>(
      insertEntriesStatement(drafts),
    );
    const byRoot = new Map<string, TrashEntryRecord>(
      result.rows.map((raw: RawTrashEntryRow): [string, TrashEntryRecord] => [
        raw.rootTaskId,
        toTrashEntryRecord(raw),
      ]),
    );
    return drafts.map((draft: TrashEntryDraft): TrashEntryRecord => {
      const entry: TrashEntryRecord | undefined = byRoot.get(draft.rootTaskId);
      if (entry === undefined) {
        throw new Error(`The trash entry of the task ${draft.rootTaskId} was not stored.`);
      }
      return entry;
    });
  }

  /**
   * Method find
   *
   * @description
   * Reads an entry by primary key, without a lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null`.
   */
  public async find(organizationId: string, entryId: string): Promise<TrashEntryRecord | null> {
    return this.one(organizationId, entryId, false);
  }

  /**
   * Method lock
   *
   * @description
   * Locks an entry by primary key `FOR UPDATE` and reads it after the lock (PostgreSQL reads the
   * latest committed version of a row it waited for, and none when it was deleted).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null`.
   */
  public async lock(organizationId: string, entryId: string): Promise<TrashEntryRecord | null> {
    return this.one(organizationId, entryId, true);
  }

  /**
   * Method pageOfLists
   *
   * @description
   * Reads a page of the trash (`trashPageStatement`); no list reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @param {TrashPosition | null} after - The last entry of the previous page.
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries.
   */
  public async pageOfLists(
    organizationId: string,
    listIds: readonly string[],
    after: TrashPosition | null,
    limit: number,
  ): Promise<readonly TrashEntryRecord[]> {
    if (listIds.length === 0) {
      return [];
    }
    return this.many(trashPageStatement(organizationId, listIds, after, limit));
  }

  /**
   * Method countOfLists
   *
   * @description
   * Counts the entries of the page (`trashTotalStatement`); no list reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<number>} The count.
   */
  public async countOfLists(organizationId: string, listIds: readonly string[]): Promise<number> {
    if (listIds.length === 0) {
      return 0;
    }
    const result = await this.db.execute<{ total: number }>(
      trashTotalStatement(organizationId, listIds),
    );
    return result.rows[0]?.total ?? 0;
  }

  /**
   * Method lockInTrashOfLists
   *
   * @description
   * Locks the entries of the lists still in the trash `FOR UPDATE` in one statement ordered by id
   * (`lockInTrashOfListsStatement`). No list locks nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<readonly { readonly id: string; readonly listId: string }[]>} The entries
   * locked, by id.
   */
  public async lockInTrashOfLists(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<readonly { readonly id: string; readonly listId: string }[]> {
    if (listIds.length === 0) {
      return [];
    }
    const result = await this.db.execute<{ id: string; listId: string }>(
      lockInTrashOfListsStatement(organizationId, listIds),
    );
    return result.rows.map((row: { id: string; listId: string }) => ({
      id: row.id,
      listId: row.listId,
    }));
  }

  /**
   * Method requestPurge
   *
   * @description
   * Hands some locked entries to the purge in one statement (`requestPurgeStatement`). No entry
   * writes nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} entryIds - The entries.
   * @param {Date} at - The transaction instant.
   * @param {TaskActor} by - Who asked.
   * @returns {Promise<number>} How many entries left the trash.
   */
  public async requestPurge(
    organizationId: string,
    entryIds: readonly string[],
    at: Date,
    by: TaskActor,
  ): Promise<number> {
    if (entryIds.length === 0) {
      return 0;
    }
    const result = await this.db.execute(requestPurgeStatement(organizationId, entryIds, at, by));
    return result.rowCount ?? 0;
  }

  /**
   * Method lockHandedOver
   *
   * @description
   * Locks the oldest entries handed over (`handedOverEntriesStatement`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, oldest first.
   */
  public async lockHandedOver(
    organizationId: string,
    limit: number,
  ): Promise<readonly TrashEntryRecord[]> {
    return this.many(handedOverEntriesStatement(organizationId, limit));
  }

  /**
   * Method lockDue
   *
   * @description
   * Locks the oldest entries due (`dueEntriesStatement`).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Date} dueBefore - The latest deletion instant that is due.
   * @param {number} limit - How many entries at most.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, oldest first.
   */
  public async lockDue(
    organizationId: string,
    dueBefore: Date,
    limit: number,
  ): Promise<readonly TrashEntryRecord[]> {
    return this.many(dueEntriesStatement(organizationId, dueBefore, limit));
  }

  /**
   * Method erase
   *
   * @description
   * Erases the entries with their tasks in the seven statements of `eraseEntriesStatements`, in
   * their order.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} entryIds - The entries.
   * @returns {Promise<void>} Resolves once erased.
   */
  public async erase(organizationId: string, entryIds: readonly string[]): Promise<void> {
    if (entryIds.length === 0) {
      return;
    }
    for (const statement of eraseEntriesStatements(organizationId, entryIds)) {
      await this.db.execute(statement);
    }
  }

  /**
   * Method remove
   *
   * @description
   * Deletes the row of a restored entry and checks it was there.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @returns {Promise<void>} Resolves once deleted.
   * @throws {Error} When the entry is gone, which its lock prevents.
   */
  public async remove(organizationId: string, entryId: string): Promise<void> {
    const result = await this.db.execute(removeEntryStatement(organizationId, entryId));
    if (result.rowCount !== 1) {
      throw new Error(`The trash entry ${entryId} vanished while it was locked.`);
    }
  }

  /**
   * Method one
   *
   * @description
   * Reads one entry by id, locked when asked.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} entryId - The entry.
   * @param {boolean} lock - `true` to lock it `FOR UPDATE`.
   * @returns {Promise<TrashEntryRecord | null>} The entry, or `null`.
   */
  private async one(
    organizationId: string,
    entryId: string,
    lock: boolean,
  ): Promise<TrashEntryRecord | null> {
    const entries: readonly TrashEntryRecord[] = await this.many(
      trashEntryStatement(organizationId, entryId, lock),
    );
    return entries[0] ?? null;
  }

  /**
   * Method many
   *
   * @description
   * Runs a read of entries and maps its rows.
   *
   * @param {SQL} statement - The statement.
   * @returns {Promise<readonly TrashEntryRecord[]>} The entries, in the order of the rows.
   */
  private async many(statement: SQL): Promise<readonly TrashEntryRecord[]> {
    const result = await this.db.execute<RawTrashEntryRow & Record<string, unknown>>(statement);
    return result.rows.map((raw: RawTrashEntryRow): TrashEntryRecord => toTrashEntryRecord(raw));
  }
  // #endregion
}
