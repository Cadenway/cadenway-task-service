import type { TransactionScope } from '@cadenway/nest-common/database';
import { and, count, eq, gt, inArray, max, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { FavoriteSavedView } from '../../../../../application/models/view/favorite-saved-view.model.js';
import type { SavedViewPosition } from '../../../../../application/models/view/saved-view-position.model.js';
import type { SavedViewRepository } from '../../../../../application/ports/outbound/persistence/view/saved-view-repository.port.js';
import type { SavedView } from '../../../../../domain/aggregates/view/saved-view.entity.js';
import type { NewSavedView } from '../../../../../domain/value-objects/view/new-saved-view.value-object.js';
import { savedViews } from '../../schemas/view/saved-view.schema.js';

/** Restricts a query to one tenant and one parent list even when RLS is already active. */
function inList(organizationId: string, listId: string): SQL {
  return sql`${savedViews.organizationId} = ${organizationId} and ${savedViews.listId} = ${listId}`;
}

/** The public subset of a view's row that favorites reads. */
const favoriteColumns = { id: savedViews.id, listId: savedViews.listId, name: savedViews.name };

/** Stores saved views in the PostgreSQL transaction of the operation. */
export class DrizzleSavedViewRepository implements SavedViewRepository {
  // #region Constructor
  /** Uses the database connection of the current tenant transaction. */
  public constructor(private readonly db: TransactionScope['db']) {}
  // #endregion

  // #region Methods
  /** Serializes version and capacity checks and order edits for this list only. */
  public async lockListOrder(organizationId: string, listId: string): Promise<void> {
    const key = `saved-views/${organizationId}/${listId}`;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  /** Reads both the capacity and the append position in the same bounded query. */
  public async lastPosition(
    organizationId: string,
    listId: string,
  ): Promise<{ count: number; max: number }> {
    const [row] = await this.db
      .select({ count: count(), max: max(savedViews.position) })
      .from(savedViews)
      .where(inList(organizationId, listId));
    return { count: row?.count ?? 0, max: row?.max ?? 0 };
  }

  /** Reads a saved view under its requested parent and locks it for an item write if needed. */
  public async read(
    organizationId: string,
    listId: string,
    viewId: string,
    lock?: 'update',
  ): Promise<SavedView | null> {
    const query = this.db
      .select()
      .from(savedViews)
      .where(and(inList(organizationId, listId), eq(savedViews.id, viewId)));
    const [row] = await (lock === undefined ? query : query.for(lock));
    return row ?? null;
  }

  /** Reads the next ordered page, following the anchor if a duplicate shifted its position. */
  public page(
    organizationId: string,
    listId: string,
    after: SavedViewPosition | null,
    limit: number,
  ): Promise<SavedView[]> {
    const placement = inList(organizationId, listId);
    const anchor =
      after === null
        ? undefined
        : this.db
            .select({ position: savedViews.position })
            .from(savedViews)
            .where(and(placement, eq(savedViews.id, after.id)));
    const condition =
      anchor === undefined || after === null
        ? placement
        : and(
            placement,
            sql`(${savedViews.position}, ${savedViews.id}) > (coalesce((${anchor}), ${after.position}), ${after.id}::uuid)`,
          );
    return this.db
      .select()
      .from(savedViews)
      .where(condition)
      .orderBy(savedViews.position, savedViews.id)
      .limit(limit);
  }

  /** Inserts the new view with fresh DB-generated identity, timestamps and version. */
  public async insert(view: NewSavedView): Promise<SavedView> {
    const [row] = await this.db.insert(savedViews).values(view).returning();
    if (row === undefined) throw new Error('A saved view insert returned no row.');
    return row;
  }

  /** Opens one position directly after the source while preserving all sibling order. */
  public async shiftAfter(organizationId: string, listId: string, position: number): Promise<void> {
    await this.db
      .update(savedViews)
      .set({ position: sql`${savedViews.position} + 1` })
      .where(and(inList(organizationId, listId), gt(savedViews.position, position)));
  }

  /** Persists an explicit settings edit on the row already locked by the use case. */
  public async update(view: SavedView): Promise<SavedView> {
    const [row] = await this.db
      .update(savedViews)
      .set({
        name: view.name,
        icon: view.icon,
        configuration: view.configuration,
        updatedAt: sql`now()`,
        version: view.version,
      })
      .where(and(inList(view.organizationId, view.listId), eq(savedViews.id, view.id)))
      .returning();
    if (row === undefined) throw new Error('A saved view update returned no row.');
    return row;
  }

  /** Removes the item already locked by the use case. */
  public async remove(organizationId: string, listId: string, viewId: string): Promise<void> {
    await this.db
      .delete(savedViews)
      .where(and(inList(organizationId, listId), eq(savedViews.id, viewId)));
  }

  /** Removes saved views of the locked parent lists, returning exact removed IDs. */
  public async removeLists(
    organizationId: string,
    listIds: readonly string[],
  ): Promise<readonly string[]> {
    if (listIds.length === 0) return [];
    const removed = await this.db
      .delete(savedViews)
      .where(
        and(eq(savedViews.organizationId, organizationId), inArray(savedViews.listId, listIds)),
      )
      .returning({ id: savedViews.id });
    return removed.map(({ id }) => id);
  }

  /** Reads a candidate favorite target and optionally holds it until the favorite write commits. */
  public async findFavoriteTarget(
    organizationId: string,
    viewId: string,
    listId?: string,
    lock?: 'share',
  ): Promise<FavoriteSavedView | null> {
    const query = this.db
      .select(favoriteColumns)
      .from(savedViews)
      .where(
        and(
          eq(savedViews.organizationId, organizationId),
          eq(savedViews.id, viewId),
          listId === undefined ? undefined : eq(savedViews.listId, listId),
        ),
      );
    const [row] = await (lock === undefined ? query : query.for(lock));
    return row ?? null;
  }

  /** Reads all candidate favorite targets in one tenant-scoped query. */
  public async findFavoriteTargets(
    organizationId: string,
    viewIds: readonly string[],
  ): Promise<readonly FavoriteSavedView[]> {
    if (viewIds.length === 0) return [];
    return this.db
      .select(favoriteColumns)
      .from(savedViews)
      .where(and(eq(savedViews.organizationId, organizationId), inArray(savedViews.id, viewIds)));
  }
  // #endregion
}
