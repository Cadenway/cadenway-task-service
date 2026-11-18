import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, sql } from 'drizzle-orm';

import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { SpaceRepository } from '../../../../../application/ports/outbound/persistence/space/space-repository.port.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { SpaceDraft } from '../../../../../domain/value-objects/space/space-draft.value-object.js';
import { toSpace } from '../../mappers/space/space.mapper.js';
import type { SpaceRow } from '../../mappers/space/space.mapper.js';
import { keysetAfter } from '../../mappers/page/keyset-after.mapper.js';
import { visibleSpaceCondition } from '../../mappers/space/visible-space.mapper.js';
import { spaces } from '../../schemas/space/space.schema.js';

/**
 * Class DrizzleSpaceRepository
 *
 * @description
 * `SpaceRepository` on the `spaces` table, in the transaction of its unit of work. Every query
 * names `organization_id`, the first column of the primary key and of both indexes; row-level
 * security is the second barrier. `listVisible` reads a page through
 * `(organization_id, created_at, id)`, bounded by the `limit` of the caller; the handover reads
 * the private spaces of one owner through `(organization_id, owner_user_id)`.
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
   * Method listVisible
   *
   * @description
   * Loads a page of the spaces a viewer sees: those of the whole organization and the private
   * ones the viewer owns, except those awaiting an owner, in the order `(created_at, id)`, after
   * `after`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first page.
   * @param {number} limit - Most rows to return.
   * @returns {Promise<Space[]>} The spaces, at most `limit`.
   */
  public async listVisible(
    organizationId: string,
    viewerUserId: string,
    after: PagePosition | null,
    limit: number,
  ): Promise<Space[]> {
    const rows: SpaceRow[] = await this.db
      .select()
      .from(spaces)
      .where(
        and(
          eq(spaces.organizationId, organizationId),
          visibleSpaceCondition(viewerUserId),
          keysetAfter(spaces.createdAt, spaces.id, after),
        ),
      )
      .orderBy(asc(spaces.createdAt), asc(spaces.id))
      .limit(limit);
    return rows.map(toSpace);
  }

  /**
   * Method listVisibleIds
   *
   * @description
   * Reads the ids of the spaces a viewer sees, with the filter of `listVisible` (the whole
   * organization, the private ones the viewer owns, none awaiting an owner), in the order
   * `(created_at, id)`. One query through `(organization_id, created_at, id)`, no limit.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @returns {Promise<readonly string[]>} The ids of the spaces.
   */
  public async listVisibleIds(
    organizationId: string,
    viewerUserId: string,
  ): Promise<readonly string[]> {
    const rows: { id: string }[] = await this.db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.organizationId, organizationId), visibleSpaceCondition(viewerUserId)))
      .orderBy(asc(spaces.createdAt), asc(spaces.id));
    return rows.map((row: { id: string }): string => row.id);
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
