import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ListAccess } from '../../../../../application/models/access/list-access.model.js';
import type { ListWithGrants } from '../../../../../application/models/access/list-with-grants.model.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { TaskListRepository } from '../../../../../application/ports/outbound/persistence/list/task-list-repository.port.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listAccessColumns, toListAccess } from '../../mappers/list/list-access.mapper.js';
import type { ListAccessRow } from '../../mappers/list/list-access.mapper.js';
import { toTaskList } from '../../mappers/list/task-list.mapper.js';
import type { TaskListRow } from '../../mappers/list/task-list.mapper.js';
import {
  toListWithGrants,
  visibleListColumns,
  viewerListGrant,
  viewerListGrantJoin,
  visibleListCondition,
} from '../../mappers/list/visible-list.mapper.js';
import type { VisibleListRow } from '../../mappers/list/visible-list.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import {
  viewerSpaceGrant,
  viewerSpaceGrantJoin,
} from '../../mappers/space/visible-space.mapper.js';
import { taskLists } from '../../schemas/list/task-list.schema.js';
import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Class DrizzleTaskListRepository
 *
 * @description
 * `TaskListRepository` on the `lists` table, in the transaction of its unit of work. Every query
 * names `organization_id`, the first column of the primary key and of the index of the lists of a
 * space `(organization_id, space_id, created_at, id)`; row-level security is the second barrier.
 * Every collection joins `spaces` on `(organization_id, id)` and applies the ONE visibility
 * condition of `visibleListCondition` over the left joins of the grants of the member on the space
 * and on the list (each one probe of the primary key of `space_grants` and `list_grants`, read once
 * per row), selecting those two roles; the application then
 * computes the role of each row with `listRoleOf`. `listOfSpaceVisibleTo` reads a page bounded by
 * the `limit` of the caller; the other collections read the few lists of one space or of the
 * organization.
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
        organizationAccess: draft.organizationAccess,
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
   * Method lockMany
   *
   * @description
   * Loads some lists by their primary keys and locks them `FOR NO KEY UPDATE` in the order of
   * their ids, so that two batches never wait on each other. No id reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @returns {Promise<TaskList[]>} The lists that exist, by id.
   */
  public async lockMany(organizationId: string, ids: readonly string[]): Promise<TaskList[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), inArray(taskLists.id, [...ids])))
      .orderBy(asc(taskLists.id))
      .for('no key update');
    return rows.map(toTaskList);
  }

  /**
   * Method update
   *
   * @description
   * Writes the name, the look, the sprint and the switch "Accès de l’organisation" of a locked
   * list, with its version and `updated_at`. The space of a list never changes.
   *
   * @param {TaskList} list - The list after the change.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone, which a lock prevents.
   */
  public async update(list: TaskList): Promise<void> {
    const { id, organizationId, name, icon, color, sprint, organizationAccess, version } =
      list.snapshot;
    const updated: { id: string }[] = await this.db
      .update(taskLists)
      .set({
        name,
        icon,
        color,
        sprintStartDate: sprint?.startDate ?? null,
        sprintEndDate: sprint?.endDate ?? null,
        sprintGoal: sprint?.goal ?? null,
        organizationAccess,
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
   * Method listOfSpaceVisibleTo
   *
   * @description
   * Loads a page of the lists of a space a member has a role on in the order `(created_at, id)`,
   * after `after`, through `lists_organization_space_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {Viewer} viewer - The member and its role.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The lists, at most `limit`.
   */
  public async listOfSpaceVisibleTo(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
    after: PagePosition | null,
    limit: number,
  ): Promise<ListWithGrants[]> {
    const rows: VisibleListRow[] = await this.visibleTo(
      organizationId,
      viewer,
      and(eq(taskLists.spaceId, spaceId), keysetAfter(taskLists.createdAt, taskLists.id, after)),
    )
      .orderBy(asc(taskLists.createdAt), asc(taskLists.id))
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method listAllOfSpaceVisibleTo
   *
   * @description
   * Loads every list of a space a member has a role on in the order `(created_at, id)`, through
   * `lists_organization_space_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<ListWithGrants[]>} Its lists the member has a role on.
   */
  public async listAllOfSpaceVisibleTo(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
  ): Promise<ListWithGrants[]> {
    const rows: VisibleListRow[] = await this.visibleTo(
      organizationId,
      viewer,
      eq(taskLists.spaceId, spaceId),
    ).orderBy(asc(taskLists.createdAt), asc(taskLists.id));
    return rows.map(toListWithGrants);
  }

  /**
   * Method listCurrentSprintsVisibleTo
   *
   * @description
   * Loads the sprints a member has a role on whose period holds `today`, bounds included, in the
   * order `(sprint_end_date, created_at, id)`, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {string} today - The calendar date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The sprints, at most `limit`.
   */
  public async listCurrentSprintsVisibleTo(
    organizationId: string,
    viewer: Viewer,
    today: string,
    limit: number,
  ): Promise<ListWithGrants[]> {
    const rows: VisibleListRow[] = await this.visibleTo(
      organizationId,
      viewer,
      and(
        sql`${taskLists.sprintStartDate} <= ${today}::date`,
        sql`${taskLists.sprintEndDate} >= ${today}::date`,
      ),
    )
      .orderBy(asc(taskLists.sprintEndDate), asc(taskLists.createdAt), asc(taskLists.id))
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method listFirstVisibleTo
   *
   * @description
   * Loads the first lists a member has a role on in the order
   * `(spaces.created_at, spaces.id, lists.created_at, lists.id)`, at most `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The lists, at most `limit`.
   */
  public async listFirstVisibleTo(
    organizationId: string,
    viewer: Viewer,
    limit: number,
  ): Promise<ListWithGrants[]> {
    const rows: VisibleListRow[] = await this.visibleTo(organizationId, viewer, undefined)
      .orderBy(asc(spaces.createdAt), asc(spaces.id), asc(taskLists.createdAt), asc(taskLists.id))
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method listAccessesVisibleTo
   *
   * @description
   * Loads what the role of a member reads of every list of the organization they have a role on
   * (`listAccessColumns`: no name, look or sprint), with the condition and the joins of the other
   * collections, in the order of `listFirstVisibleTo`, no limit: the lists of an organization are
   * few.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<ListAccess[]>} The lean rows.
   */
  public async listAccessesVisibleTo(
    organizationId: string,
    viewer: Viewer,
  ): Promise<ListAccess[]> {
    const rows: ListAccessRow[] = await this.db
      .select(listAccessColumns())
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, taskLists.organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(and(eq(taskLists.organizationId, organizationId), visibleListCondition(viewer)))
      .orderBy(asc(spaces.createdAt), asc(spaces.id), asc(taskLists.createdAt), asc(taskLists.id));
    return rows.map(toListAccess);
  }

  /**
   * Method visibleTo
   *
   * @description
   * The lists of the organization a member has a role on: `lists` joined to their space on
   * `(organization_id, id)` and left joined to the grant of the member on that space and on the
   * list (each one probe of a primary key, read once per row), with the columns of
   * `visibleListColumns` and one more condition.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {SQL | undefined} condition - What the collection adds, or `undefined`.
   * @returns {object} The query, to order and bound.
   */
  private visibleTo(organizationId: string, viewer: Viewer, condition: SQL | undefined) {
    return this.db
      .select(visibleListColumns())
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, taskLists.organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(eq(taskLists.organizationId, organizationId), visibleListCondition(viewer), condition),
      )
      .$dynamic();
  }
  // #endregion
}
