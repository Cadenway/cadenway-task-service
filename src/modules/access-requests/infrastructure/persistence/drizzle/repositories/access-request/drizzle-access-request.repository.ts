import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, count, desc, eq, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { PendingScope } from '../../../../../application/models/access-request/pending-scope.model.js';
import type { PagePosition } from '../../../../../application/models/page/page-position.model.js';
import type { AccessRequestRepository } from '../../../../../application/ports/outbound/persistence/access-request/access-request-repository.port.js';
import type { AccessRequest } from '../../../../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRequestDraft } from '../../../../../domain/value-objects/access-request/access-request-draft.value-object.js';
import type { AccessRequestState } from '../../../../../domain/value-objects/access-request/access-request-state.value-object.js';
import { toAccessRequest } from '../../mappers/access-request/access-request.mapper.js';
import type { AccessRequestRow } from '../../mappers/access-request/access-request.mapper.js';
import { anyOf } from '../../mappers/page/any-of.mapper.js';
import { keysetBefore } from '../../mappers/page/keyset-before.mapper.js';
import { accessRequests } from '../../schemas/access-request/access-request.schema.js';

/**
 * Constant PENDING
 *
 * @description
 * The predicate of the two partial indexes, written as a literal so that the planner matches it
 * with `access_requests_pending_index` and `access_requests_pending_unique` whatever the plan.
 *
 * @type {SQL}
 */
const PENDING: SQL = sql`${accessRequests.state} = 'pending'`;

/**
 * Function scopeCondition
 *
 * @description
 * The pending requests a member answers: the space requests of the spaces they manage, the list
 * and task requests of the lists they have `edit` on, narrowed by the filters.
 *
 * @param {string} organizationId - The organization of the transaction.
 * @param {PendingScope} scope - The scope.
 * @returns {SQL | undefined} The condition.
 */
function scopeCondition(organizationId: string, scope: PendingScope): SQL | undefined {
  return and(
    eq(accessRequests.organizationId, organizationId),
    PENDING,
    or(
      and(eq(accessRequests.target, 'space'), anyOf(accessRequests.spaceId, scope.spaceIds)),
      and(ne(accessRequests.target, 'space'), anyOf(accessRequests.listId, scope.listIds)),
    ),
    scope.spaceId === null ? undefined : eq(accessRequests.spaceId, scope.spaceId),
    scope.listId === null ? undefined : eq(accessRequests.listId, scope.listId),
  );
}

/**
 * Class DrizzleAccessRequestRepository
 *
 * @description
 * `AccessRequestRepository` on the `access_requests` table, in the transaction of its unit of
 * work. Every query names `organization_id`, the first column of the primary key and of both
 * partial indexes; row-level security is the second barrier. The insert relies on
 * `access_requests_pending_unique` (one pending request per requester and target), the clean-up
 * of a former member reads through its `(organization_id, requester_user_id)` prefix, and the
 * listing walks `access_requests_pending_index` `(organization_id, created_at, id)` backwards,
 * filtering on the spaces and lists the member answers.
 */
export class DrizzleAccessRequestRepository implements AccessRequestRepository {
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
   * Method insertPending
   *
   * @description
   * `INSERT ... ON CONFLICT (organization_id, requester_user_id, target, target_id) WHERE state =
   * 'pending' DO NOTHING RETURNING *`: a pending request for the same target is kept as it is.
   *
   * @param {AccessRequestDraft} draft - The checked request.
   * @returns {Promise<AccessRequest | null>} The stored request, or `null` when one was pending.
   */
  public async insertPending(draft: AccessRequestDraft): Promise<AccessRequest | null> {
    const rows: AccessRequestRow[] = await this.db
      .insert(accessRequests)
      .values({
        organizationId: draft.organizationId,
        target: draft.target,
        targetId: draft.targetId,
        spaceId: draft.spaceId,
        listId: draft.listId,
        taskId: draft.taskId,
        taskKey: draft.taskKey,
        requesterUserId: draft.requesterUserId,
        message: draft.message,
      })
      .onConflictDoNothing({
        target: [
          accessRequests.organizationId,
          accessRequests.requesterUserId,
          accessRequests.target,
          accessRequests.targetId,
        ],
        where: sql`state = 'pending'`,
      })
      .returning();
    const row: AccessRequestRow | undefined = rows[0];
    return row === undefined ? null : toAccessRequest(row);
  }

  /**
   * Method lock
   *
   * @description
   * Loads a request by its organization and its id, `FOR UPDATE`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} id - The id of the request.
   * @returns {Promise<AccessRequest | null>} The request, or `null`.
   */
  public async lock(organizationId: string, id: string): Promise<AccessRequest | null> {
    const rows: AccessRequestRow[] = await this.db
      .select()
      .from(accessRequests)
      .where(and(eq(accessRequests.organizationId, organizationId), eq(accessRequests.id, id)))
      .limit(1)
      .for('update');
    const row: AccessRequestRow | undefined = rows[0];
    return row === undefined ? null : toAccessRequest(row);
  }

  /**
   * Method saveDecision
   *
   * @description
   * Writes the answer of a locked pending request.
   *
   * @param {AccessRequest} request - The request, answered.
   * @returns {Promise<void>} Resolves once written.
   * @throws {Error} When the row is no longer pending.
   */
  public async saveDecision(request: AccessRequest): Promise<void> {
    const state: AccessRequestState = request.snapshot;
    const updated: { id: string }[] = await this.db
      .update(accessRequests)
      .set({
        state: state.status,
        role: state.role,
        decidedAt: state.decidedAt,
        decidedByType: state.decidedBy === null ? null : state.decidedBy.type,
        decidedById: state.decidedBy === null ? null : state.decidedBy.id,
      })
      .where(
        and(
          eq(accessRequests.organizationId, state.organizationId),
          eq(accessRequests.id, state.id),
          PENDING,
        ),
      )
      .returning({ id: accessRequests.id });
    if (updated.length !== 1) {
      throw new Error('The access request was answered while it was locked.');
    }
  }

  /**
   * Method listPending
   *
   * @description
   * Loads a page of the pending requests of a scope, `(created_at desc, id desc)`, after a
   * position.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {PendingScope} scope - What the member answers, and the filters.
   * @param {PagePosition | null} after - Where the page starts, `null` for the first.
   * @param {number} limit - Most requests to return.
   * @returns {Promise<readonly AccessRequest[]>} The requests, at most `limit`.
   */
  public async listPending(
    organizationId: string,
    scope: PendingScope,
    after: PagePosition | null,
    limit: number,
  ): Promise<readonly AccessRequest[]> {
    const rows: AccessRequestRow[] = await this.db
      .select()
      .from(accessRequests)
      .where(
        and(
          scopeCondition(organizationId, scope),
          keysetBefore(accessRequests.createdAt, accessRequests.id, after),
        ),
      )
      .orderBy(desc(accessRequests.createdAt), desc(accessRequests.id))
      .limit(limit);
    return rows.map(toAccessRequest);
  }

  /**
   * Method countPending
   *
   * @description
   * Counts the pending requests of a scope.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {PendingScope} scope - What the member answers, and the filters.
   * @returns {Promise<number>} How many.
   */
  public async countPending(organizationId: string, scope: PendingScope): Promise<number> {
    const rows: { total: number }[] = await this.db
      .select({ total: count() })
      .from(accessRequests)
      .where(scopeCondition(organizationId, scope));
    return rows[0]?.total ?? 0;
  }

  /**
   * Method lockPendingOf
   *
   * @description
   * Locks the first pending requests of a requester, in id order, `FOR UPDATE`, through the
   * `(organization_id, requester_user_id)` prefix of `access_requests_pending_unique`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} requesterUserId - The account.
   * @param {number} limit - Most requests to lock.
   * @returns {Promise<readonly string[]>} Their ids.
   */
  public async lockPendingOf(
    organizationId: string,
    requesterUserId: string,
    limit: number,
  ): Promise<readonly string[]> {
    const rows: { id: string }[] = await this.db
      .select({ id: accessRequests.id })
      .from(accessRequests)
      .where(
        and(
          eq(accessRequests.organizationId, organizationId),
          eq(accessRequests.requesterUserId, requesterUserId),
          PENDING,
        ),
      )
      .orderBy(asc(accessRequests.id))
      .limit(limit)
      .for('update');
    return rows.map((row: { id: string }): string => row.id);
  }

  /**
   * Method deleteRequests
   *
   * @description
   * Deletes pending requests by id, in one statement.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} ids - The ids, locked by the caller.
   * @returns {Promise<number>} How many were deleted.
   */
  public async deleteRequests(organizationId: string, ids: readonly string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }
    const deleted: { id: string }[] = await this.db
      .delete(accessRequests)
      .where(
        and(
          eq(accessRequests.organizationId, organizationId),
          anyOf(accessRequests.id, ids),
          PENDING,
        ),
      )
      .returning({ id: accessRequests.id });
    return deleted.length;
  }
  // #endregion
}
