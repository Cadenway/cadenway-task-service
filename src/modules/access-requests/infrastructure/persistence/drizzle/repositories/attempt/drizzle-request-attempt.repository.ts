import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, desc, eq, gt, lte, sql } from 'drizzle-orm';

import type { RequestAttemptRepository } from '../../../../../application/ports/outbound/persistence/attempt/request-attempt-repository.port.js';
import { accessRequestAttempts } from '../../schemas/access-request/access-request-attempt.schema.js';

/**
 * Class DrizzleRequestAttemptRepository
 *
 * @description
 * `RequestAttemptRepository` on the `access_request_attempts` table, in the transaction of its unit
 * of work. Every query names `organization_id` and the account, the prefix of
 * `access_request_attempts_user_index` `(organization_id, user_id, attempted_at)`, which serves the
 * count, the pruning and the deletion as one range each. The requests of one requester are
 * serialized by a transaction-level advisory lock, released at the commit or the rollback.
 */
export class DrizzleRequestAttemptRepository implements RequestAttemptRepository {
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
   * Method serialize
   *
   * @description
   * `pg_advisory_xact_lock(hashtextextended('access-request:<organization>:<account>', 0))`: one
   * 64-bit key per requester and organization, held until the end of the transaction. Two keys that
   * collide (or a key of another feature) only serialize two unrelated requests for a moment.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @returns {Promise<void>} Resolves once the transaction holds the lock.
   */
  public async serialize(organizationId: string, userId: string): Promise<void> {
    const key: string = `access-request:${organizationId}:${userId}`;
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }

  /**
   * Method recent
   *
   * @description
   * Reads the most recent attempts of the requester after an instant.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @param {Date} after - The start of the window, excluded.
   * @param {number} limit - Most instants to read.
   * @returns {Promise<readonly Date[]>} The instants, the most recent first.
   */
  public async recent(
    organizationId: string,
    userId: string,
    after: Date,
    limit: number,
  ): Promise<readonly Date[]> {
    const rows: { attemptedAt: Date }[] = await this.db
      .select({ attemptedAt: accessRequestAttempts.attemptedAt })
      .from(accessRequestAttempts)
      .where(
        and(
          eq(accessRequestAttempts.organizationId, organizationId),
          eq(accessRequestAttempts.userId, userId),
          gt(accessRequestAttempts.attemptedAt, after),
        ),
      )
      .orderBy(desc(accessRequestAttempts.attemptedAt))
      .limit(limit);
    return rows.map((row: { attemptedAt: Date }): Date => row.attemptedAt);
  }

  /**
   * Method prune
   *
   * @description
   * Deletes the attempts of the requester that left the window.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @param {Date} upTo - The start of the window, included.
   * @returns {Promise<void>} Resolves once deleted.
   */
  public async prune(organizationId: string, userId: string, upTo: Date): Promise<void> {
    await this.db
      .delete(accessRequestAttempts)
      .where(
        and(
          eq(accessRequestAttempts.organizationId, organizationId),
          eq(accessRequestAttempts.userId, userId),
          lte(accessRequestAttempts.attemptedAt, upTo),
        ),
      );
  }

  /**
   * Method record
   *
   * @description
   * Inserts one attempt; PostgreSQL gives its id and the instant of the transaction.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The requester.
   * @returns {Promise<void>} Resolves once recorded.
   */
  public async record(organizationId: string, userId: string): Promise<void> {
    await this.db.insert(accessRequestAttempts).values({ organizationId, userId });
  }

  /**
   * Method deleteAll
   *
   * @description
   * Deletes every attempt of an account.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @returns {Promise<void>} Resolves once deleted.
   */
  public async deleteAll(organizationId: string, userId: string): Promise<void> {
    await this.db
      .delete(accessRequestAttempts)
      .where(
        and(
          eq(accessRequestAttempts.organizationId, organizationId),
          eq(accessRequestAttempts.userId, userId),
        ),
      );
  }
  // #endregion
}
