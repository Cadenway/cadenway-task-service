import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { SpaceWithGrants } from '../../../../../application/models/access/space-with-grants.model.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { SpaceRepository } from '../../../../../application/ports/outbound/persistence/space/space-repository.port.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceDraft } from '../../../../../domain/value-objects/space/space-draft.value-object.js';
import { toSpace } from '../../mappers/space/space.mapper.js';
import type { SpaceRow } from '../../mappers/space/space.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import {
  toSpaceWithGrants,
  visibleSpaceColumns,
  viewerListSpaces,
  viewerListSpacesJoin,
  viewerSpaceGrant,
  viewerSpaceGrantJoin,
  visibleSpaceCondition,
} from '../../mappers/space/visible-space.mapper.js';
import type { VisibleSpaceRow } from '../../mappers/space/visible-space.mapper.js';
import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Class DrizzleSpaceRepository
 *
 * @description
 * `SpaceRepository` on the `spaces` table, in the transaction of its unit of work. Every query
 * names `organization_id`, the first column of the primary key and of both indexes; row-level
 * security is the second barrier. `listVisible` reads a page through
 * `(organization_id, created_at, id)`, bounded by the `limit` of the caller, with the one
 * visibility condition of `visibleSpaceCondition` and the grants of the member on each row; the
 * handover reads the private spaces of one owner through `(organization_id, owner_user_id)`.
 */
export class DrizzleSpaceRepository implements SpaceRepository {
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
   * Stores a new space and restores it from the row PostgreSQL returned, with its id, its
   * creation instant and version 1.
   *
   * @param {SpaceDraft} draft - The validated space.
   * @returns {Promise<Space>} The stored space.
   * @throws {Error} When no row came back.
   */
  public async insert(draft: SpaceDraft): Promise<Space> {
    const rows: SpaceRow[] = await this.db
      .insert(spaces)
      .values({
        organizationId: draft.organizationId,
        name: draft.name,
        prefix: draft.prefix,
        description: draft.description,
        icon: draft.icon,
        color: draft.color,
        visibility: draft.visibility,
        ownerUserId: draft.ownerUserId,
        awaitingOwner: draft.awaitingOwner,
        statuses: draft.statuses,
      })
      .returning();
    const row: SpaceRow | undefined = rows[0];
    if (row === undefined) {
      throw new Error('The space was not stored.');
    }
    return toSpace(row);
  }

  /**
   * Method find
   *
   * @description
   * Loads a space by its organization and its id.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null`.
   */
  public async find(organizationId: string, id: string): Promise<Space | null> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, id)))
      .limit(1);
    const row: SpaceRow | undefined = rows[0];
    return row === undefined ? null : toSpace(row);
  }

  /**
   * Method lock
   *
   * @description
   * Loads a space by its organization and its id, and locks its row until the end of the
   * transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null`.
   */
  public async lock(organizationId: string, id: string): Promise<Space | null> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, id)))
      .limit(1)
      .for('no key update');
    const row: SpaceRow | undefined = rows[0];
    return row === undefined ? null : toSpace(row);
  }

  /**
   * Method update
   *
   * @description
   * Writes every member of a locked space, with its version and `updated_at`.
   *
   * @param {Space} space - The space after the change.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone, which a lock prevents.
   */
  public async update(space: Space): Promise<void> {
    const { id, organizationId, name, prefix, description, icon, color, visibility } =
      space.snapshot;
    const { ownerUserId, awaitingOwner, statuses, version } = space.snapshot;
    const updated: { id: string }[] = await this.db
      .update(spaces)
      .set({
        name,
        prefix,
        description,
        icon,
        color,
        visibility,
        ownerUserId,
        awaitingOwner,
        statuses,
        version,
        updatedAt: sql`now()`,
      })
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, id)))
      .returning({ id: spaces.id });
    if (updated.length !== 1) {
      throw new Error('The space vanished while it was locked.');
    }
  }

  /**
   * Method lockShared
   *
   * @description
   * Loads a space by its organization and its id, and locks its row `FOR SHARE` until the end of
   * the transaction: a change of the grants of one of its lists keeps its owner, and a change of
   * the space waits for it.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the space.
   * @returns {Promise<Space | null>} The space, or `null`.
   */
  public async lockShared(organizationId: string, id: string): Promise<Space | null> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.id, id)))
      .limit(1)
      .for('share');
    const row: SpaceRow | undefined = rows[0];
    return row === undefined ? null : toSpace(row);
  }

  /**
   * Method lockInOrder
   *
   * @description
   * Reads the `(created_at, id)` of some spaces without lock, then locks each in that order, the
   * order of `lockPrivateOwnedBy`, `FOR NO KEY UPDATE` or `FOR SHARE` as asked: one statement per
   * space, since a statement takes one lock mode. No space reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly { readonly id: string; readonly mode: 'update' | 'share' }[]} locks - The
   * spaces and how to lock each.
   * @returns {Promise<Space[]>} The spaces that exist, in the order they were locked.
   */
  public async lockInOrder(
    organizationId: string,
    locks: readonly { readonly id: string; readonly mode: 'update' | 'share' }[],
  ): Promise<Space[]> {
    if (locks.length === 0) {
      return [];
    }
    const modes = new Map<string, 'update' | 'share'>(
      locks.map((lock): [string, 'update' | 'share'] => [lock.id, lock.mode]),
    );
    const ordered: { id: string }[] = await this.db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), inArray(spaces.id, [...modes.keys()])))
      .orderBy(asc(spaces.createdAt), asc(spaces.id));
    const locked: Space[] = [];
    for (const { id } of ordered) {
      const space: Space | null =
        modes.get(id) === 'share'
          ? await this.lockShared(organizationId, id)
          : await this.lock(organizationId, id);
      if (space !== null) {
        locked.push(space);
      }
    }
    return locked;
  }

  /**
   * Method listVisible
   *
   * @description
   * Loads a page of the spaces a member sees, with the one condition of `visibleSpaceCondition`
   * and the grants of the member on each, in the order `(created_at, id)`, after `after`, through
   * `(organization_id, created_at, id)`. The grant of each space is one left join on the primary
   * key of `space_grants`; the spaces of the lists shared with the member, one range of
   * `list_grants_user_index` read once and left joined.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<SpaceWithGrants[]>} The spaces, at most `limit`.
   */
  public async listVisible(
    organizationId: string,
    viewer: Viewer,
    after: PagePosition | null,
    limit: number,
  ): Promise<SpaceWithGrants[]> {
    const rows: VisibleSpaceRow[] = await this.visibleTo(
      organizationId,
      viewer,
      keysetAfter(spaces.createdAt, spaces.id, after),
    )
      .orderBy(asc(spaces.createdAt), asc(spaces.id))
      .limit(limit);
    return rows.map(toSpaceWithGrants);
  }

  /**
   * Method listAllVisible
   *
   * @description
   * Loads every space a member sees, with the condition, the joins and the order of
   * `listVisible`, no limit: the spaces of an organization are few.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @returns {Promise<SpaceWithGrants[]>} The spaces.
   */
  public async listAllVisible(organizationId: string, viewer: Viewer): Promise<SpaceWithGrants[]> {
    const rows: VisibleSpaceRow[] = await this.visibleTo(organizationId, viewer, undefined).orderBy(
      asc(spaces.createdAt),
      asc(spaces.id),
    );
    return rows.map(toSpaceWithGrants);
  }

  /**
   * Method visibleTo
   *
   * @description
   * The spaces of the organization a member sees: `spaces` left joined to the grant of the member
   * on each and to the spaces of the lists shared with them, with the columns of
   * `visibleSpaceColumns` and one more condition.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member and its role.
   * @param {SQL | undefined} condition - What the collection adds, or `undefined`.
   * @returns {object} The query, to order and bound.
   */
  private visibleTo(organizationId: string, viewer: Viewer, condition: SQL | undefined) {
    return this.db
      .select(visibleSpaceColumns())
      .from(spaces)
      .leftJoin(viewerSpaceGrant, viewerSpaceGrantJoin(organizationId, viewer.userId))
      .leftJoin(viewerListSpaces(organizationId, viewer.userId), viewerListSpacesJoin())
      .where(
        and(eq(spaces.organizationId, organizationId), visibleSpaceCondition(viewer), condition),
      )
      .$dynamic();
  }

  /**
   * Method lockPrivateOwnedBy
   *
   * @description
   * Loads and locks the first `limit` private spaces an account owns and that do not await an
   * owner, in the order `(created_at, id)`, so that two batches cannot wait on each other. The
   * candidates come from `spaces_organization_owner_index` (`organization_id, owner_user_id`):
   * the rows of one owner in one organization, sorted in memory and cut at `limit`. A handed-over
   * space leaves that range, and a space marked awaiting stays in it but is filtered out, so each
   * batch reads at most the private spaces the account still has plus those awaiting an owner.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} ownerUserId - The account.
   * @param {number} limit - Most spaces to lock.
   * @returns {Promise<Space[]>} Its private spaces, at most `limit`.
   */
  public async lockPrivateOwnedBy(
    organizationId: string,
    ownerUserId: string,
    limit: number,
  ): Promise<Space[]> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(
        and(
          eq(spaces.organizationId, organizationId),
          eq(spaces.visibility, 'private'),
          eq(spaces.ownerUserId, ownerUserId),
          eq(spaces.awaitingOwner, false),
        ),
      )
      .orderBy(asc(spaces.createdAt), asc(spaces.id))
      .limit(limit)
      .for('no key update');
    return rows.map(toSpace);
  }

  /**
   * Method lockAwaitingOwner
   *
   * @description
   * Loads and locks the spaces of an organization that await an owner, in the order
   * `(created_at, id)`. Read when the copy of the memberships learns the owner of the
   * organization, which is rare: no index of its own, the organization prefix of the listing index
   * bounds it.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @returns {Promise<Space[]>} The spaces awaiting an owner.
   */
  public async lockAwaitingOwner(organizationId: string): Promise<Space[]> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), eq(spaces.awaitingOwner, true)))
      .orderBy(asc(spaces.createdAt), asc(spaces.id))
      .for('no key update');
    return rows.map(toSpace);
  }
  // #endregion
}
