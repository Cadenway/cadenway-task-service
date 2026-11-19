import type { TransactionDatabase } from '@cadenway/nest-common/database';

import type { ArchivePosition } from '../../../../../application/models/archive/archive-position.model.js';
import type { ArchiveReader } from '../../../../../application/ports/outbound/persistence/archive/archive-reader.port.js';
import type { ArchivedRootView } from '../../../../../application/projections/archive/archived-root.projection.js';
import type { TaskSummaryView } from '../../../../../application/projections/task/task-summary.projection.js';
import {
  archiveMemberCountsStatement,
  archivedRootsCountStatement,
  archivedRootsPageStatement,
  liveRootCountsStatement,
} from '../../mappers/archive/archive-statements.mapper.js';
import type { RawArchivedRootRow } from '../../mappers/archive/raw-archived-root-row.mapper.js';
import { toTaskSummaryRow } from '../../mappers/query/task-page-row.mapper.js';
import type { TaskSummaryRow } from '../../mappers/task/task-summary.mapper.js';
import { toActorType } from '../../mappers/task/task-values.mapper.js';
import { DrizzleTaskCollections } from '../task/task-collections.repository.js';

/**
 * Class DrizzleArchiveReader
 *
 * @description
 * `ArchiveReader` on `tasks`, in the transaction of its unit of work, without a lock. Every
 * statement names `organization_id`. A page of the roots of the archives is one statement on the
 * partial index `tasks_archive_root_index` (`archive_root`, walked backwards from the
 * keyset, the lists of the actor a filter of its rows), then the five statements of the summaries
 * of its rows (`DrizzleTaskCollections.summarize`), whatever its size; the total, the member counts
 * (`tasks_archive_member_index`) and the task counts of archived lists (`tasks_list_created_index`)
 * are one grouped statement each. No list, root or row reads nothing.
 */
export class DrizzleArchiveReader implements ArchiveReader {
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

  /**
   * Property collections
   *
   * @description
   * The loader of the summaries of the rows of a page.
   *
   * @type {DrizzleTaskCollections}
   * @readonly
   */
  private readonly collections: DrizzleTaskCollections;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Binds the reader to a transaction.
   *
   * @param {TransactionDatabase} db - The Drizzle database of the transaction.
   * @constructor
   */
  public constructor(db: TransactionDatabase) {
    this.db = db;
    this.collections = new DrizzleTaskCollections(db);
  }
  // #endregion

  // #region Methods
  /**
   * Method pageOfRoots
   *
   * @description
   * Reads a page of the roots of the archives of some lists, the most recently archived first,
   * summarized (their subtask counts those of the subtasks archived with them).
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {ArchivePosition | null} after - The last root of the previous page, `null` for the first.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ArchivedRootView[]>} The roots, in the order of the page.
   * @throws {Error} When a stored value is outside its set.
   */
  public async pageOfRoots(
    organizationId: string,
    listIds: readonly string[],
    after: ArchivePosition | null,
    limit: number,
  ): Promise<readonly ArchivedRootView[]> {
    if (listIds.length === 0) {
      return [];
    }
    const result = await this.db.execute<RawArchivedRootRow & Record<string, unknown>>(
      archivedRootsPageStatement(organizationId, listIds, after, limit),
    );
    const rows: readonly TaskSummaryRow[] = result.rows.map(
      (raw: RawArchivedRootRow): TaskSummaryRow => toTaskSummaryRow(raw),
    );
    const summaries: readonly TaskSummaryView[] = await this.collections.summarize(
      organizationId,
      rows,
    );
    return result.rows.flatMap((raw: RawArchivedRootRow, index: number): ArchivedRootView[] => {
      const task: TaskSummaryView | undefined = summaries[index];
      return task === undefined
        ? []
        : [
            {
              task,
              archivedAt: new Date(raw.archivedAt),
              archivedBy: {
                type: toActorType(raw.archivedByType, `task ${raw.id}`),
                id: raw.archivedById,
              },
            },
          ];
    });
  }

  /**
   * Method countRoots
   *
   * @description
   * Counts the roots of the archives of some lists.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @returns {Promise<number>} The count; 0 without a statement for no list.
   */
  public async countRoots(organizationId: string, listIds: readonly string[]): Promise<number> {
    if (listIds.length === 0) {
      return 0;
    }
    const result = await this.db.execute<{ total: number }>(
      archivedRootsCountStatement(organizationId, listIds),
    );
    return result.rows[0]?.total ?? 0;
  }

  /**
   * Method memberCounts
   *
   * @description
   * Counts the members of archives, their roots included.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} rootIds - The roots.
   * @returns {Promise<ReadonlyMap<string, number>>} The count by root id.
   */
  public async memberCounts(
    organizationId: string,
    rootIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    if (rootIds.length === 0) {
      return counts;
    }
    const result = await this.db.execute<{ rootId: string; members: number }>(
      archiveMemberCountsStatement(organizationId, rootIds),
    );
    for (const row of result.rows) {
      counts.set(row.rootId, row.members);
    }
    return counts;
  }

  /**
   * Method liveRootCounts
   *
   * @description
   * Counts the live top-level tasks of lists.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @returns {Promise<ReadonlyMap<string, number>>} The count by list id; a list without one is
   * left out.
   */
  public async liveRootCounts(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const counts = new Map<string, number>();
    if (listIds.length === 0) {
      return counts;
    }
    const result = await this.db.execute<{ listId: string; total: number }>(
      liveRootCountsStatement(organizationId, listIds),
    );
    for (const row of result.rows) {
      counts.set(row.listId, row.total);
    }
    return counts;
  }
  // #endregion
}
