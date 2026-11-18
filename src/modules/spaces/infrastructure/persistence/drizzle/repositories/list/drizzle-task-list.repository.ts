import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { TaskListRepository } from '../../../../../application/ports/outbound/persistence/list/task-list-repository.port.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import { toTaskList } from '../../mappers/list/task-list.mapper.js';
import type { TaskListRow } from '../../mappers/list/task-list.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';

/**
 * Class DrizzleTaskListRepository
 *
 * @description
 * `TaskListRepository` on the `lists` table, in the transaction of its unit of work. Every query
 * names `organization_id`, the first column of the primary key and of the index of the lists of a
 * space `(organization_id, space_id, created_at, id)`; row-level security is the second barrier.
 * `listOfSpace` reads a page bounded by the `limit` of the caller.
 */
export class DrizzleTaskListRepository implements TaskListRepository {
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
   * Method insert
   *
   * @description
   * Stores a new list and restores it from the row PostgreSQL returned, with its id, its
   * creation instant and version 1.
   *
   * @param {TaskListDraft} draft - The validated list.
   * @returns {Promise<TaskList>} The stored list.
   * @throws {Error} When no row came back.
   */
  public async insert(draft: TaskListDraft): Promise<TaskList> {
    const rows: TaskListRow[] = await this.db
      .insert(taskLists)
      .values({
        organizationId: draft.organizationId,
        spaceId: draft.spaceId,
        name: draft.name,
        icon: draft.icon,
        color: draft.color,
        sprintStartDate: draft.sprint?.startDate ?? null,
        sprintEndDate: draft.sprint?.endDate ?? null,
        sprintGoal: draft.sprint?.goal ?? null,
      })
      .returning();
    const row: TaskListRow | undefined = rows[0];
    if (row === undefined) {
      throw new Error('The list was not stored.');
    }
    return toTaskList(row);
  }

  /**
   * Method find
   *
   * @description
   * Loads a list by its organization and its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async find(organizationId: string, id: string): Promise<TaskList | null> {
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.id, id)))
      .limit(1);
    const row: TaskListRow | undefined = rows[0];
    return row === undefined ? null : toTaskList(row);
  }

  /**
   * Method lock
   *
   * @description
   * Loads a list by its organization and its id, and locks its row until the end of the
   * transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async lock(organizationId: string, id: string): Promise<TaskList | null> {
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.id, id)))
      .limit(1)
      .for('no key update');
    const row: TaskListRow | undefined = rows[0];
    return row === undefined ? null : toTaskList(row);
  }

  /**
   * Method update
   *
   * @description
   * Writes the name, the look and the sprint of a locked list, with its version and
   * `updated_at`. The space of a list never changes.
   *
   * @param {TaskList} list - The list after the change.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone, which a lock prevents.
   */
  public async update(list: TaskList): Promise<void> {
    const { id, organizationId, name, icon, color, sprint, version } = list.snapshot;
    const updated: { id: string }[] = await this.db
      .update(taskLists)
      .set({
        name,
        icon,
        color,
        sprintStartDate: sprint?.startDate ?? null,
        sprintEndDate: sprint?.endDate ?? null,
        sprintGoal: sprint?.goal ?? null,
        version,
        updatedAt: sql`now()`,
      })
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.id, id)))
      .returning({ id: taskLists.id });
    if (updated.length !== 1) {
      throw new Error('The list vanished while it was locked.');
    }
  }

  /**
   * Method listOfSpace
   *
   * @description
   * Loads a page of the lists of a space in the order `(created_at, id)`, after `after`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<TaskList[]>} The lists, at most `limit`.
   */
  public async listOfSpace(
    organizationId: string,
    spaceId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<TaskList[]> {
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.spaceId, spaceId),
          keysetAfter(taskLists.createdAt, taskLists.id, after),
        ),
      )
      .orderBy(asc(taskLists.createdAt), asc(taskLists.id))
      .limit(limit);
    return rows.map(toTaskList);
  }
  // #endregion
}
