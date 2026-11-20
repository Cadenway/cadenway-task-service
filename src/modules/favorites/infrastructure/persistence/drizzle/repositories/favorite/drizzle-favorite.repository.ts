import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, count, eq, gt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { FavoriteOwner } from '../../../../../application/models/collection/favorite-owner.model.js';
import type { FavoritePosition } from '../../../../../application/models/collection/favorite-position.model.js';
import type { FavoriteTarget } from '../../../../../application/models/target/favorite-target.model.js';
import type { FavoriteRepository } from '../../../../../application/ports/outbound/persistence/favorite/favorite-repository.port.js';
import type { Favorite } from '../../../../../domain/aggregates/favorite/favorite.entity.js';
import { FAVORITE_LIMIT } from '../../../../../domain/policies/favorite/favorite-limit.policy.js';
import type { FavoriteKind } from '../../../../../domain/value-objects/target/favorite-kind.value-object.js';
import { favorites } from '../../schemas/favorite/favorite.schema.js';

/** Columns the application can see from an owner-scoped load. */
const favoriteColumns = {
  id: favorites.id,
  kind: favorites.kind,
  targetId: favorites.targetId,
  createdAt: favorites.createdAt,
  version: favorites.version,
};

/** Adds explicit owner scope on top of the tenant RLS policy. */
function ownerCondition(owner: FavoriteOwner): SQL | undefined {
  return and(
    eq(favorites.organizationId, owner.organizationId),
    eq(favorites.userId, owner.actorUserId),
  );
}

/** Persists private favorites on the connection shared by the current tenant transaction. */
export class DrizzleFavoriteRepository implements FavoriteRepository {
  // #region Constructor
  /** Takes the active transaction connection. */
  public constructor(private readonly db: TransactionDatabase) {}
  // #endregion

  // #region Methods
  /** Holds the collection's advisory lock through commit, including when it has no rows. */
  public async lockOwner(owner: FavoriteOwner): Promise<void> {
    const key = `favorite-owner:${owner.organizationId}:${owner.actorUserId}`;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  /** Finds by owner and ID. */
  public async find(owner: FavoriteOwner, id: string): Promise<Favorite | null> {
    const [row] = await this.db
      .select(favoriteColumns)
      .from(favorites)
      .where(and(ownerCondition(owner), eq(favorites.id, id)))
      .limit(1);
    return row ?? null;
  }

  /** Looks up the bounded owner's collection in stable creation order. */
  public async list(
    owner: FavoriteOwner,
    after: FavoritePosition | null,
  ): Promise<readonly Favorite[]> {
    const boundary =
      after === null
        ? undefined
        : or(
            gt(favorites.createdAt, after.createdAt),
            and(eq(favorites.createdAt, after.createdAt), gt(favorites.id, after.id)),
          );
    return this.db
      .select(favoriteColumns)
      .from(favorites)
      .where(and(ownerCondition(owner), boundary))
      .orderBy(asc(favorites.createdAt), asc(favorites.id))
      .limit(FAVORITE_LIMIT);
  }

  /** Looks up the composite uniqueness key without checking target visibility. */
  public async has(owner: FavoriteOwner, target: FavoriteTarget): Promise<boolean> {
    const [row] = await this.db
      .select({ id: favorites.id })
      .from(favorites)
      .where(
        and(
          ownerCondition(owner),
          eq(favorites.kind, target.kind),
          eq(favorites.targetId, target.targetId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /** Counts every row in the owner's collection. */
  public async count(owner: FavoriteOwner): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(favorites)
      .where(ownerCondition(owner));
    return row?.count ?? 0;
  }

  /** Inserts a new versioned row after the use case checks limits under its lock. */
  public async insert(owner: FavoriteOwner, target: FavoriteTarget): Promise<Favorite> {
    const [row] = await this.db
      .insert(favorites)
      .values({
        organizationId: owner.organizationId,
        userId: owner.actorUserId,
        kind: target.kind,
        targetId: target.targetId,
      })
      .returning(favoriteColumns);
    if (row === undefined) {
      throw new Error('Favorite insertion returned no row');
    }
    return row;
  }

  /** Removes one row and reports whether it was still present. */
  public async delete(owner: FavoriteOwner, id: string): Promise<boolean> {
    const [row] = await this.db
      .delete(favorites)
      .where(and(ownerCondition(owner), eq(favorites.id, id)))
      .returning({ id: favorites.id });
    return row !== undefined;
  }

  /** Removes all favorites for the tenant's targets of the given kind. */
  public async purgeTargets(
    organizationId: string,
    kind: FavoriteKind,
    targetIds: readonly string[],
  ): Promise<void> {
    await this.db
      .delete(favorites)
      .where(
        and(
          eq(favorites.organizationId, organizationId),
          eq(favorites.kind, kind),
          sql`${favorites.targetId} = any(${sql.param([...targetIds])}::uuid[])`,
        ),
      );
  }

  /** Clears a single owner's collection without touching other actors or tenants. */
  public async purgeOwner(owner: FavoriteOwner): Promise<void> {
    await this.db.delete(favorites).where(ownerCondition(owner));
  }
  // #endregion
}
