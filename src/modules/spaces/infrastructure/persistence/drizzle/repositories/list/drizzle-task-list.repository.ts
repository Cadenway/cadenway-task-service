import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { ListAccess } from '../../../../../application/models/access/list-access.model.js';
import type { ListWithGrants } from '../../../../../application/models/access/list-with-grants.model.js';
import type { TrashListAccess } from '../../../../../application/models/list/trash-list-access.model.js';
import type { ArchivedListPosition } from '../../../../../application/models/page/archived-list-position.model.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { TaskListRepository } from '../../../../../application/ports/outbound/persistence/list/task-list-repository.port.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { ListActor } from '../../../../../domain/value-objects/list/list-actor.value-object.js';
import type { TaskListDraft } from '../../../../../domain/value-objects/list/task-list-draft.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { listAccessColumns, toListAccess } from '../../mappers/list/list-access.mapper.js';
import {
  archivedListAfter,
  archivedListCondition,
  listPositionInSpace,
  liveListCondition,
} from '../../mappers/list/list-archive.mapper.js';
import type { ListAccessRow } from '../../mappers/list/list-access.mapper.js';
import {
  deletedListCondition,
  undeletedListCondition,
} from '../../mappers/list/list-tombstone.mapper.js';
import {
  toTrashListAccess,
  trashListAccessColumns,
} from '../../mappers/list/trash-list-access.mapper.js';
import type { TrashListAccessRow } from '../../mappers/list/trash-list-access.mapper.js';
import { toTaskList } from '../../mappers/list/task-list.mapper.js';
import type { TaskListRow } from '../../mappers/list/task-list.mapper.js';
import {
  listAccessCondition,
  toListWithGrants,
  visibleListColumns,
  viewerListGrant,
  viewerListGrantJoin,
  visibleListCondition,
} from '../../mappers/list/visible-list.mapper.js';
import type { VisibleListRow } from '../../mappers/list/visible-list.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import { spacePositionInSidebar } from '../../mappers/space/space-position.mapper.js';
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
 * The readings by id and the locks before a change apply `undeletedListCondition`, so a tombstone
 * answers as an unknown list; `lockMany` (the clean-up of a member who left, the erasure of the
 * trash), the methods named `IncludingDeleted`, the trash reads and the deletion machinery read the
 * tombstones on purpose. Several lists are locked in one statement in ascending id.
 * Every collection joins `spaces` on `(organization_id, id)` and applies the ONE visibility
 * condition of `visibleListCondition` (no tombstone of a list or of its space) over the left joins
 * of the grants of the member on the space
 * and on the list (each one probe of the primary key of `space_grants` and `list_grants`, read once
 * per row), selecting those two roles; the application then
 * computes the role of each row with `listRoleOf`. The collections of a space, of the sprints and
 * of the sidebar add `liveListCondition` and order the lists of a space by `listPositionInSpace`
 * (`coalesce(restored_at, created_at)`, id as tie-breaker), which no index orders: they sort the
 * few lists of one space or of the organization; the sidebar orders the spaces by
 * `spacePositionInSidebar` (`coalesce(restored_at, created_at)`), sorted too. The trash reads apply
 * `listAccessCondition` alone, the role "as if not deleted". `listOfSpaceVisibleTo` and
 * `listArchivedVisibleTo` read a page bounded by the `limit` of the caller; the archives and their
 * count read the partial index `lists_organization_archived_index` by a bitmap scan, then sort the
 * archived lists the member sees (O(archived lists of the organization), not a walk stopped at the
 * limit; plans of `tests/archive-queries.int-spec.ts`).
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
   * Loads a list by its organization and its id, unless it is deleted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async find(organizationId: string, id: string): Promise<TaskList | null> {
    return this.findRow(organizationId, id, undeletedListCondition());
  }

  /**
   * Method lock
   *
   * @description
   * Loads a list by its organization and its id, and locks its row `FOR NO KEY UPDATE` until the
   * end of the transaction, unless it is deleted. A deletion committed while the statement waited
   * for the row leaves it out, as PostgreSQL checks the condition again on the row it locks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async lock(organizationId: string, id: string): Promise<TaskList | null> {
    return this.lockRow(organizationId, id, 'no key update', undeletedListCondition());
  }

  /**
   * Method lockShared
   *
   * @description
   * Loads a list by its organization and its id, and locks its row `FOR SHARE` until the end of
   * the transaction, unless it is deleted.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async lockShared(organizationId: string, id: string): Promise<TaskList | null> {
    return this.lockRow(organizationId, id, 'share', undeletedListCondition());
  }

  /**
   * Method lockSharedUnlessLocked
   *
   * @description
   * Loads a list by its organization and its id, and locks its row `FOR SHARE SKIP LOCKED`
   * until the end of the transaction, unless it is deleted: a row a writer holds is left out at
   * once.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async lockSharedUnlessLocked(
    organizationId: string,
    id: string,
  ): Promise<TaskList | null> {
    return this.lockRow(organizationId, id, 'share', undeletedListCondition(), true);
  }

  /**
   * Method lockMany
   *
   * @description
   * Loads some lists by their primary keys and locks them in one statement in ascending id, so
   * that two lockers never wait on each other: `FOR NO KEY UPDATE` (`update`) or `FOR UPDATE`
   * (`delete`) or `FOR SHARE` (`share`); deleted ones are locked like any other, for the clean-up
   * of a member who left and the trash. No id reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @param {'update' | 'delete' | 'share'} [mode] - How the caller writes or holds them next,
   * `update` by default.
   * @returns {Promise<TaskList[]>} The lists that exist, by id.
   */
  public async lockMany(
    organizationId: string,
    ids: readonly string[],
    mode: 'update' | 'delete' | 'share' = 'update',
  ): Promise<TaskList[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          sql`${taskLists.id} = any(${sql.param([...ids])}::uuid[])`,
        ),
      )
      .orderBy(asc(taskLists.id))
      .for(mode === 'update' ? 'no key update' : mode === 'delete' ? 'update' : 'share');
    return rows.map(toTaskList);
  }

  /**
   * Method findManyIncludingDeleted
   *
   * @description
   * Loads some lists by their primary keys, live, archived or deleted, without lock, in one
   * statement. No id reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids of the lists.
   * @returns {Promise<TaskList[]>} The lists that exist, in no particular order.
   */
  public async findManyIncludingDeleted(
    organizationId: string,
    ids: readonly string[],
  ): Promise<TaskList[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          sql`${taskLists.id} = any(${sql.param([...ids])}::uuid[])`,
        ),
      );
    return rows.map(toTaskList);
  }

  /**
   * Method lockUndeletedOfSpace
   *
   * @description
   * Locks `FOR NO KEY UPDATE` the lists of a space that are not deleted yet, in ascending id, in
   * one statement over the range `(organization_id, space_id)` of
   * `lists_organization_space_created_index`, then a sort of the few lists of the space; the rows
   * are locked in the order of the sort. A list a concurrent deletion of it wrote first is left
   * out, as PostgreSQL checks the condition again on the row it locks.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space, locked by the caller.
   * @returns {Promise<string[]>} The ids of the locked lists, ascending.
   */
  public async lockUndeletedOfSpace(organizationId: string, spaceId: string): Promise<string[]> {
    const rows: { id: string }[] = await this.db
      .select({ id: taskLists.id })
      .from(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.spaceId, spaceId),
          undeletedListCondition(),
        ),
      )
      .orderBy(asc(taskLists.id))
      .for('no key update');
    return rows.map((row: { id: string }): string => row.id);
  }

  /**
   * Method update
   *
   * @description
   * Writes the name, the look, the sprint, the switch "Accès de l’organisation", the archive
   * (`archived_at`, `archived_by_*`, `restored_at`) and the tombstone (`deleted_at`,
   * `deleted_by_*`) of a locked list, with its version and `updated_at`. The space of a list never
   * changes.
   *
   * @param {TaskList} list - The list after the change.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone, which a lock prevents.
   */
  public async update(list: TaskList): Promise<void> {
    const {
      id,
      organizationId,
      name,
      icon,
      color,
      sprint,
      organizationAccess,
      archivedAt,
      archivedBy,
      restoredAt,
      deletedAt,
      deletedBy,
      version,
    } = list.snapshot;
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
        archivedAt,
        archivedByType: archivedBy?.type ?? null,
        archivedById: archivedBy?.id ?? null,
        restoredAt,
        deletedAt,
        deletedByType: deletedBy?.type ?? null,
        deletedById: deletedBy?.id ?? null,
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
   * Loads a page of the live lists of a space a member has a role on in the order
   * `(coalesce(restored_at, created_at), id)`, after `after`; the lists of the space come from
   * `lists_organization_space_created_index` and are sorted, a space holding few lists.
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
      and(
        eq(taskLists.spaceId, spaceId),
        liveListCondition(),
        keysetAfter(listPositionInSpace(), taskLists.id, after),
      ),
    )
      .orderBy(asc(listPositionInSpace()), asc(taskLists.id))
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method listAllOfSpaceVisibleTo
   *
   * @description
   * Loads every live list of a space a member has a role on in the order
   * `(coalesce(restored_at, created_at), id)`, the lists of the space read through
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
      and(eq(taskLists.spaceId, spaceId), liveListCondition()),
    ).orderBy(asc(listPositionInSpace()), asc(taskLists.id));
    return rows.map(toListWithGrants);
  }

  /**
   * Method listCurrentSprintsVisibleTo
   *
   * @description
   * Loads the live sprints a member has a role on whose period holds `today`, bounds included, in
   * the order `(sprint_end_date, created_at, id)` ("by last day then in the order of their
   * creation"), at most `limit`.
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
        liveListCondition(),
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
   * Loads the first live lists a member has a role on in the order
   * `(coalesce(spaces.restored_at, spaces.created_at), spaces.id,
   * coalesce(lists.restored_at, lists.created_at), lists.id)`, at most `limit`.
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
    const rows: VisibleListRow[] = await this.visibleTo(organizationId, viewer, liveListCondition())
      .orderBy(
        asc(spacePositionInSidebar()),
        asc(spaces.id),
        asc(listPositionInSpace()),
        asc(taskLists.id),
      )
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method listAccessesVisibleTo
   *
   * @description
   * Loads what the role of a member reads of every list of the organization they have a role on,
   * archived ones included (`listAccessColumns`: no name, look or sprint), with the visibility
   * condition and the joins of the other collections, in the order of `listFirstVisibleTo`, no
   * limit: the lists of an organization are few.
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
      .orderBy(
        asc(spacePositionInSidebar()),
        asc(spaces.id),
        asc(listPositionInSpace()),
        asc(taskLists.id),
      );
    return rows.map(toListAccess);
  }

  /**
   * Method listArchivedVisibleTo
   *
   * @description
   * Loads a page of the archived lists of the organization a member has a role on in the order
   * `(archived_at desc, id desc)`, after `after`, at most `limit`: a bitmap scan of
   * `lists_organization_archived_index`, whose predicate `archivedListCondition` repeats, then a
   * sort of the archived lists the member sees, cut at `limit`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {ArchivedListPosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<ListWithGrants[]>} The archived lists, at most `limit`.
   */
  public async listArchivedVisibleTo(
    organizationId: string,
    viewer: Viewer,
    after: ArchivedListPosition | null,
    limit: number,
  ): Promise<ListWithGrants[]> {
    const rows: VisibleListRow[] = await this.visibleTo(
      organizationId,
      viewer,
      and(archivedListCondition(), archivedListAfter(after)),
    )
      .orderBy(desc(taskLists.archivedAt), desc(taskLists.id))
      .limit(limit);
    return rows.map(toListWithGrants);
  }

  /**
   * Method countArchivedVisibleTo
   *
   * @description
   * Counts the archived lists of the organization a member has a role on, with the joins and the
   * conditions of `listArchivedVisibleTo`, in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<number>} The count.
   */
  public async countArchivedVisibleTo(organizationId: string, viewer: Viewer): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, taskLists.organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          visibleListCondition(viewer),
          archivedListCondition(),
        ),
      );
    return rows[0]?.total ?? 0;
  }

  /**
   * Method listVisibleByIds
   *
   * @description
   * Loads those of some lists of the organization a member has a role on, archived ones included,
   * by their primary keys, in one statement. No id reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {readonly string[]} ids - The ids of the lists, UUIDs.
   * @returns {Promise<ListWithGrants[]>} The lists the member has a role on, by id.
   */
  public async listVisibleByIds(
    organizationId: string,
    viewer: Viewer,
    ids: readonly string[],
  ): Promise<ListWithGrants[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows: VisibleListRow[] = await this.visibleTo(
      organizationId,
      viewer,
      inArray(taskLists.id, [...ids]),
    ).orderBy(asc(taskLists.id));
    return rows.map(toListWithGrants);
  }

  /**
   * Method findIncludingDeleted
   *
   * @description
   * Loads a list by its organization and its id, live, archived or deleted, without lock.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async findIncludingDeleted(organizationId: string, id: string): Promise<TaskList | null> {
    return this.findRow(organizationId, id, undefined);
  }

  /**
   * Method lockIncludingDeleted
   *
   * @description
   * Loads a list by its organization and its id, live, archived or deleted, and locks its row until
   * the end of the transaction: `FOR SHARE`, `FOR NO KEY UPDATE` or `FOR UPDATE` as the caller
   * holds, changes or erases it.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @param {'share' | 'update' | 'delete'} mode - How the caller holds or writes it next.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  public async lockIncludingDeleted(
    organizationId: string,
    id: string,
    mode: 'share' | 'update' | 'delete',
  ): Promise<TaskList | null> {
    const strength: 'share' | 'no key update' | 'update' =
      mode === 'share' ? 'share' : mode === 'update' ? 'no key update' : 'update';
    return this.lockRow(organizationId, id, strength, undefined);
  }

  /**
   * Method markDeletedWithSpace
   *
   * @description
   * Writes the tombstone of a deleted space on every list of it that is not deleted yet, in ONE
   * `UPDATE` of the range `(organization_id, space_id)` of `lists_organization_space_created_index`
   * (O(lists of the space)): `deleted_at` and `deleted_by_*` of the space, `updated_at`, and the
   * same version (`TaskList.deleteWithSpace`), after `lockUndeletedOfSpace` locked them in
   * ascending id (an `UPDATE` takes its rows in the order of its scan). A list deleted on its own
   * keeps its tombstone.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The deleted space, locked by the caller.
   * @param {ListActor} by - Who deleted the space.
   * @param {Date} at - The instant of the deletion of the space.
   * @returns {Promise<readonly string[]>} The lists written.
   */
  public async markDeletedWithSpace(
    organizationId: string,
    spaceId: string,
    by: ListActor,
    at: Date,
  ): Promise<readonly string[]> {
    const marked: { id: string }[] = await this.db
      .update(taskLists)
      .set({
        deletedAt: at,
        deletedByType: by.type,
        deletedById: by.id,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.spaceId, spaceId),
          undeletedListCondition(),
        ),
      )
      .returning({ id: taskLists.id });
    return marked.map(({ id }) => id);
  }

  /**
   * Method listDeletedIdsOfSpace
   *
   * @description
   * Reads the ids of the deleted lists of a space, by id: one range of
   * `lists_organization_space_created_index`, then a sort of the few lists of the space.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<string[]>} The ids.
   */
  public async listDeletedIdsOfSpace(organizationId: string, spaceId: string): Promise<string[]> {
    const rows: { id: string }[] = await this.db
      .select({ id: taskLists.id })
      .from(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.spaceId, spaceId),
          deletedListCondition(),
        ),
      )
      .orderBy(asc(taskLists.id));
    return rows.map((row: { id: string }): string => row.id);
  }

  /**
   * Method anyOfSpace
   *
   * @description
   * Reads whether a space still holds a list row, live, archived or deleted: one probe of the
   * range `(organization_id, space_id)` of `lists_organization_space_created_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space.
   * @returns {Promise<boolean>} Whether one is left.
   */
  public async anyOfSpace(organizationId: string, spaceId: string): Promise<boolean> {
    const rows: { id: string }[] = await this.db
      .select({ id: taskLists.id })
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.spaceId, spaceId)))
      .limit(1);
    return rows.length > 0;
  }

  /**
   * Method erase
   *
   * @description
   * Deletes the row of a deleted list by its primary key, its tombstone checked again in the
   * statement; the foreign key of `list_grants` refuses it while a grant of it is left.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @returns {Promise<void>} Resolves once erased.
   * @throws {Error} When no deleted list was erased.
   */
  public async erase(organizationId: string, id: string): Promise<void> {
    const erased: { id: string }[] = await this.db
      .delete(taskLists)
      .where(
        and(
          eq(taskLists.organizationId, organizationId),
          eq(taskLists.id, id),
          deletedListCondition(),
        ),
      )
      .returning({ id: taskLists.id });
    if (erased.length !== 1) {
      throw new Error('The deleted list to erase is not a tombstone.');
    }
  }

  /**
   * Method listTrashAccessesVisibleTo
   *
   * @description
   * Loads the lean rows of every list of the organization, live, archived or deleted, in a live or
   * deleted space, on which a member would have a role as if not deleted, with
   * `listAccessCondition` over the joins of the collections (`trashListAccessColumns`: the name,
   * the switch, the archive and the tombstones, no look or sprint), in no particular order, no
   * limit: O(lists of the organization), as `listAccessesVisibleTo`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<TrashListAccess[]>} The lean rows.
   */
  public async listTrashAccessesVisibleTo(
    organizationId: string,
    viewer: Viewer,
  ): Promise<TrashListAccess[]> {
    const rows: TrashListAccessRow[] = await this.trashVisibleTo(organizationId, viewer, undefined);
    return rows.map(toTrashListAccess);
  }

  /**
   * Method findTrashAccessVisibleTo
   *
   * @description
   * Loads the lean row of one list, live, archived or deleted, by its primary key, when a member
   * would have a role on it as if not deleted, in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {string} id - The id of the list, a UUID.
   * @returns {Promise<TrashListAccess | null>} The lean row, or `null`.
   */
  public async findTrashAccessVisibleTo(
    organizationId: string,
    viewer: Viewer,
    id: string,
  ): Promise<TrashListAccess | null> {
    const rows: TrashListAccessRow[] = await this.trashVisibleTo(
      organizationId,
      viewer,
      eq(taskLists.id, id),
    );
    const row: TrashListAccessRow | undefined = rows[0];
    return row === undefined ? null : toTrashListAccess(row);
  }

  /**
   * Method trashVisibleTo
   *
   * @description
   * The lean rows of the lists of the organization a member would have a role on as if not
   * deleted: `lists` joined to their space and left joined to the grants of the member, as the
   * collections, with `listAccessCondition` instead of `visibleListCondition` and one more
   * condition.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {SQL | undefined} condition - What the reading adds, or `undefined`.
   * @returns {Promise<TrashListAccessRow[]>} The lean rows.
   */
  private async trashVisibleTo(
    organizationId: string,
    viewer: Viewer,
    condition: SQL | undefined,
  ): Promise<TrashListAccessRow[]> {
    return this.db
      .select(trashListAccessColumns())
      .from(taskLists)
      .innerJoin(
        spaces,
        and(eq(spaces.organizationId, taskLists.organizationId), eq(spaces.id, taskLists.spaceId)),
      )
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListGrant, viewerListGrantJoin(organizationId, viewer.userId))
      .where(
        and(eq(taskLists.organizationId, organizationId), listAccessCondition(viewer), condition),
      );
  }

  /**
   * Method findRow
   *
   * @description
   * Loads one list by its primary key, with one more condition (the tombstone condition of a
   * reading), or none for the trash.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @param {SQL | undefined} condition - The condition the row must meet, or `undefined`.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  private async findRow(
    organizationId: string,
    id: string,
    condition: SQL | undefined,
  ): Promise<TaskList | null> {
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.id, id), condition))
      .limit(1);
    const row: TaskListRow | undefined = rows[0];
    return row === undefined ? null : toTaskList(row);
  }

  /**
   * Method lockRow
   *
   * @description
   * Loads one list by its primary key and locks its row in a lock mode until the end of the
   * transaction, with one more condition (the tombstone condition of a reading before a change),
   * or none for the trash.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the list.
   * @param {'update' | 'no key update' | 'share'} strength - The row lock.
   * @param {SQL | undefined} condition - The condition the row must meet, or `undefined`.
   * @param {boolean} [skipLocked] - `true` to leave out a row another transaction holds in a
   * conflicting mode instead of waiting for it (`SKIP LOCKED`); `false` by default.
   * @returns {Promise<TaskList | null>} The list, or `null`.
   */
  private async lockRow(
    organizationId: string,
    id: string,
    strength: 'update' | 'no key update' | 'share',
    condition: SQL | undefined,
    skipLocked: boolean = false,
  ): Promise<TaskList | null> {
    const rows: TaskListRow[] = await this.db
      .select()
      .from(taskLists)
      .where(and(eq(taskLists.organizationId, organizationId), eq(taskLists.id, id), condition))
      .limit(1)
      .for(strength, skipLocked ? { skipLocked: true } : {});
    const row: TaskListRow | undefined = rows[0];
    return row === undefined ? null : toTaskList(row);
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
