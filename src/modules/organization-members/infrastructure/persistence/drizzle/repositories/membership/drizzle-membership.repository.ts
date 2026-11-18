import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';

import type { MembershipRepository } from '../../../../../application/ports/outbound/persistence/membership/membership-repository.port.js';
import type { Membership } from '../../../../../domain/aggregates/membership/membership.aggregate.js';
import { toMembership } from '../../mappers/membership/organization-member.mapper.js';
import type { OrganizationMemberRow } from '../../mappers/membership/organization-member.mapper.js';
import { organizationMembers } from '../../schemas/membership/organization-member.schema.js';

/**
 * Constant activeMembershipsCap
 *
 * @description
 * Most active memberships of one account in one organization read at once. organization-service
 * removes a membership before the person can join again, so the copy holds one, or two while that
 * removal is on its way: the cap only keeps the read bounded should the copy ever drift.
 *
 * @type {number}
 */
const activeMembershipsCap: number = 10;

/**
 * Class DrizzleMembershipRepository
 *
 * @description
 * `MembershipRepository` on the `organization_members` table, in the transaction of its unit of
 * work. Every query names `organization_id`, the first column of the primary key and of the index
 * of the reads by account; row-level security is the second barrier. A `memberId` stored under
 * another organization is invisible and never conflicts: the primary key starts with the
 * organization. Every read returns at most one row, but the active memberships of an account,
 * bounded by `activeMembershipsCap`.
 */
export class DrizzleMembershipRepository implements MembershipRepository {
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
   * Method lock
   *
   * @description
   * Loads and locks a membership by its organization and its id, until the end of the transaction.
   *
   * @param {string} organizationId - The organization of the event.
   * @param {string} id - The `memberId`.
   * @returns {Promise<Membership | null>} The membership, or `null`.
   */
  public async lock(organizationId: string, id: string): Promise<Membership | null> {
    const rows: OrganizationMemberRow[] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.id, id)),
      )
      .limit(1)
      .for('update');
    const row: OrganizationMemberRow | undefined = rows[0];
    return row === undefined ? null : toMembership(row);
  }

  /**
   * Method insertIfAbsent
   *
   * @description
   * Inserts a membership, or nothing when its organization already holds its id: a concurrent
   * insert of the same key waits for the other transaction, then inserts nothing.
   *
   * @param {Membership} membership - The new copy.
   * @returns {Promise<boolean>} Whether it was inserted.
   */
  public async insertIfAbsent(membership: Membership): Promise<boolean> {
    const { id, organizationId, userId, role, version, removedAt } = membership.snapshot;
    const inserted: { id: string }[] = await this.db
      .insert(organizationMembers)
      .values({ organizationId, id, userId, role, version, removedAt })
      .onConflictDoNothing({ target: [organizationMembers.organizationId, organizationMembers.id] })
      .returning({ id: organizationMembers.id });
    return inserted.length === 1;
  }

  /**
   * Method update
   *
   * @description
   * Writes the role, the version and the removal of a locked membership.
   *
   * @param {Membership} membership - The membership after the change.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is gone, which a lock prevents.
   */
  public async update(membership: Membership): Promise<void> {
    const { id, organizationId, role, version, removedAt } = membership.snapshot;
    const updated: { id: string }[] = await this.db
      .update(organizationMembers)
      .set({ role, version, removedAt, updatedAt: sql`now()` })
      .where(
        and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.id, id)),
      )
      .returning({ id: organizationMembers.id });
    if (updated.length !== 1) {
      throw new Error('The membership vanished while it was locked.');
    }
  }

  /**
   * Method listActiveByUser
   *
   * @description
   * Loads the active memberships of an account in an organization, through the index on
   * `(organization_id, user_id)`, the latest stored first. There is one, or two while a removal
   * and a new join of the same person cross; `activeMembershipsCap` bounds the read all the same.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {boolean} lock - `FOR SHARE` until the end of the transaction: a removal, which locks
   * the row `FOR UPDATE`, waits for the write of the caller.
   * @returns {Promise<Membership[]>} The memberships, empty when there is none.
   */
  public async listActiveByUser(
    organizationId: string,
    userId: string,
    lock: boolean,
  ): Promise<Membership[]> {
    const query = this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
          isNull(organizationMembers.removedAt),
        ),
      )
      .orderBy(desc(organizationMembers.createdAt), desc(organizationMembers.id))
      .limit(activeMembershipsCap);
    const rows: OrganizationMemberRow[] = lock ? await query.for('share') : await query;
    return rows.map(toMembership);
  }

  /**
   * Method findActiveOwner
   *
   * @description
   * Loads the active owner of an organization: the earliest stored, so that the answer stays
   * deterministic should the copy ever hold two.
   *
   * @param {string} organizationId - The organization.
   * @returns {Promise<Membership | null>} The membership of the owner, or `null`.
   */
  public async findActiveOwner(organizationId: string): Promise<Membership | null> {
    const rows: OrganizationMemberRow[] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, 'owner'),
          isNull(organizationMembers.removedAt),
        ),
      )
      .orderBy(asc(organizationMembers.createdAt), asc(organizationMembers.id))
      .limit(1);
    const row: OrganizationMemberRow | undefined = rows[0];
    return row === undefined ? null : toMembership(row);
  }
  // #endregion
}
