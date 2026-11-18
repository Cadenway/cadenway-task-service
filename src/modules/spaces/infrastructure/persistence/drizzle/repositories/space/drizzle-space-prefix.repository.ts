import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { SpacePrefixRepository } from '../../../../../application/ports/outbound/persistence/space/space-prefix-repository.port.js';
import { spacePrefixes } from '../../schemas/space/space-prefix.schema.js';

/**
 * Class DrizzleSpacePrefixRepository
 *
 * @description
 * `SpacePrefixRepository` on the `space_prefixes` table, in the transaction of its unit of work.
 * Every query names `organization_id`, the first column of the primary key
 * `(organization_id, prefix)`; row-level security is the second barrier. The reads and the
 * allocation are by primary key, bounded by the prefixes asked for.
 */
export class DrizzleSpacePrefixRepository implements SpacePrefixRepository {
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
   * Method claim
   *
   * @description
   * Inserts the prefix for the space, or nothing when the organization already holds it. A
   * concurrent claim of the same free prefix waits on the primary key for the other transaction:
   * once it commits, the insert does nothing and the read that follows sees its row; once it
   * rolls back, the insert succeeds. The prefix is the space's when it was inserted, or when the
   * row that holds it names the space.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} prefix - The prefix.
   * @param {string} spaceId - The space that takes it.
   * @returns {Promise<boolean>} `true` when the prefix is the space's, `false` when another space
   * uses or used it.
   * @throws {Error} When the row that held the prefix is gone, which a primary key conflict
   * rules out.
   */
  public async claim(organizationId: string, prefix: string, spaceId: string): Promise<boolean> {
    const inserted: { prefix: string }[] = await this.db
      .insert(spacePrefixes)
      .values({ organizationId, prefix, spaceId })
      .onConflictDoNothing({ target: [spacePrefixes.organizationId, spacePrefixes.prefix] })
      .returning({ prefix: spacePrefixes.prefix });
    if (inserted.length === 1) {
      return true;
    }
    const holders: { spaceId: string }[] = await this.db
      .select({ spaceId: spacePrefixes.spaceId })
      .from(spacePrefixes)
      .where(
        and(eq(spacePrefixes.organizationId, organizationId), eq(spacePrefixes.prefix, prefix)),
      )
      .limit(1);
    const holder: { spaceId: string } | undefined = holders[0];
    if (holder === undefined) {
      throw new Error('The prefix was held and is gone.');
    }
    return holder.spaceId === spaceId;
  }

  /**
   * Method nextNumbers
   *
   * @description
   * Reads the counters of the prefixes asked for in one query and adds one to each; a prefix
   * with no row has given no number yet, so its next number is 1. Nothing is reserved.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} prefixes - The prefixes.
   * @returns {Promise<ReadonlyMap<string, number>>} The next number of each prefix asked for.
   */
  public async nextNumbers(
    organizationId: string,
    prefixes: readonly string[],
  ): Promise<ReadonlyMap<string, number>> {
    const next = new Map<string, number>(
      prefixes.map((prefix: string): [string, number] => [prefix, 1]),
    );
    if (prefixes.length === 0) {
      return next;
    }
    const rows: { prefix: string; lastNumber: number }[] = await this.db
      .select({ prefix: spacePrefixes.prefix, lastNumber: spacePrefixes.lastNumber })
      .from(spacePrefixes)
      .where(
        and(
          eq(spacePrefixes.organizationId, organizationId),
          inArray(spacePrefixes.prefix, [...prefixes]),
        ),
      );
    for (const row of rows) {
      next.set(row.prefix, row.lastNumber + 1);
    }
    return next;
  }

  /**
   * Method allocate
   *
   * @description
   * Advances the counter of a prefix by `count` with one `UPDATE ... RETURNING`, scoped by
   * organization, prefix and space. The update takes the row lock, kept until the transaction
   * ends: a concurrent allocation of the prefix waits for the commit, then reads the new counter,
   * so the numbers never overlap, and a rollback undoes the advance.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} prefix - The prefix.
   * @param {string} spaceId - The space that must hold the prefix.
   * @param {number} count - How many numbers, at least 1.
   * @returns {Promise<number | null>} The counter after the allocation, or `null` when no row
   * matches.
   */
  public async allocate(
    organizationId: string,
    prefix: string,
    spaceId: string,
    count: number,
  ): Promise<number | null> {
    const rows: { lastNumber: number }[] = await this.db
      .update(spacePrefixes)
      .set({ lastNumber: sql`${spacePrefixes.lastNumber} + ${count}::bigint` })
      .where(
        and(
          eq(spacePrefixes.organizationId, organizationId),
          eq(spacePrefixes.prefix, prefix),
          eq(spacePrefixes.spaceId, spaceId),
        ),
      )
      .returning({ lastNumber: spacePrefixes.lastNumber });
    return rows[0]?.lastNumber ?? null;
  }
  // #endregion
}
