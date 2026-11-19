import type { TransactionDatabase } from '@cadenway/nest-common/database';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { EventActor } from '../../../../../application/models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../../application/models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../../application/models/access/stored-grant.model.js';
import type { ViewerGrants } from '../../../../../application/models/access/viewer-grants.model.js';
import type { GrantRepository } from '../../../../../application/ports/outbound/persistence/access/grant-repository.port.js';
import type { AccessRole } from '../../../../../domain/value-objects/access/access-role.value-object.js';
import { toAccessRole, toStoredGrant } from '../../mappers/access/stored-grant.mapper.js';
import { listGrants } from '../../schemas/access/list-grant.schema.js';
import { spaceGrants } from '../../schemas/access/space-grant.schema.js';

/**
 * Class DrizzleGrantRepository
 *
 * @description
 * `GrantRepository` on `space_grants` and `list_grants`, in the transaction of its unit of work.
 * Every query names `organization_id`, the first column of both primary keys and of both indexes
 * of the grants of a person; row-level security is the second barrier. The grants of one space or
 * one list are a range of the primary key, 200 at most; the grants of one person are a range of
 * `space_grants_user_index` and `list_grants_user_index`, bounded by the `limit` of the caller.
 */
export class DrizzleGrantRepository implements GrantRepository {
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
   * Method viewerGrants
   *
   * @description
   * Reads the three grants of a member around a space in ONE statement of three scalar
   * subqueries: the grant of the space and the grant of the list by their primary keys, and
   * whether a grant of any list of the space exists, by the range
   * `(organization_id, user_id, space_id)` of `list_grants_user_index`.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} viewerUserId - The account of the member.
   * @param {string} spaceId - The space.
   * @param {string | null} listId - A list of the space, or `null` for the space alone.
   * @returns {Promise<ViewerGrants>} The grants of the member there.
   */
  public async viewerGrants(
    organizationId: string,
    viewerUserId: string,
    spaceId: string,
    listId: string | null,
  ): Promise<ViewerGrants> {
    const listRole =
      listId === null
        ? sql`null::text`
        : sql`(select ${listGrants.role} from ${listGrants} where ${listGrants.organizationId} = ${organizationId} and ${listGrants.listId} = ${listId} and ${listGrants.userId} = ${viewerUserId})`;
    const result = await this.db.execute<{
      spaceRole: string | null;
      listRole: string | null;
      anyList: boolean;
    }>(sql`select
      (select ${spaceGrants.role} from ${spaceGrants} where ${spaceGrants.organizationId} = ${organizationId} and ${spaceGrants.spaceId} = ${spaceId} and ${spaceGrants.userId} = ${viewerUserId}) as "spaceRole",
      ${listRole} as "listRole",
      exists (select 1 from ${listGrants} where ${listGrants.organizationId} = ${organizationId} and ${listGrants.userId} = ${viewerUserId} and ${listGrants.spaceId} = ${spaceId}) as "anyList"`);
    const row: { spaceRole: string | null; listRole: string | null; anyList: boolean } | undefined =
      result.rows[0];
    if (row === undefined) {
      throw new Error('The grants of the member were not read.');
    }
    return {
      space: toAccessRole(row.spaceRole),
      list: toAccessRole(row.listRole),
      anyList: row.anyList,
    };
  }

  /**
   * Method listOf
   *
   * @description
   * Reads every grant of a space or a list in the order `(created_at, user_id)`, one range of its
   * primary key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list.
   * @returns {Promise<StoredGrant[]>} Its grants.
   */
  public async listOf(organizationId: string, resource: GrantedResource): Promise<StoredGrant[]> {
    if (resource.kind === 'space') {
      const rows = await this.db
        .select()
        .from(spaceGrants)
        .where(
          and(
            eq(spaceGrants.organizationId, organizationId),
            eq(spaceGrants.spaceId, resource.spaceId),
          ),
        )
        .orderBy(asc(spaceGrants.createdAt), asc(spaceGrants.userId));
      return rows.map(toStoredGrant);
    }
    const rows = await this.db
      .select()
      .from(listGrants)
      .where(
        and(eq(listGrants.organizationId, organizationId), eq(listGrants.listId, resource.listId)),
      )
      .orderBy(asc(listGrants.createdAt), asc(listGrants.userId));
    return rows.map(toStoredGrant);
  }

  /**
   * Method put
   *
   * @description
   * Inserts the grant, or on its primary key changes its role, `granted_at` (now) and
   * `granted_by_*`; `created_at` stays. A grant of a list stores the space of the list.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list, locked by the caller.
   * @param {string} userId - The person.
   * @param {AccessRole} role - The role.
   * @param {EventActor} actor - Who gives it.
   * @returns {Promise<StoredGrant>} The grant as stored.
   * @throws {Error} When no row came back.
   */
  public async put(
    organizationId: string,
    resource: GrantedResource,
    userId: string,
    role: AccessRole,
    actor: EventActor,
  ): Promise<StoredGrant> {
    const change = {
      role,
      grantedByType: actor.type,
      grantedById: actor.id,
      grantedAt: sql`now()`,
    };
    const rows =
      resource.kind === 'space'
        ? await this.db
            .insert(spaceGrants)
            .values({
              organizationId,
              spaceId: resource.spaceId,
              userId,
              role,
              grantedByType: actor.type,
              grantedById: actor.id,
            })
            .onConflictDoUpdate({
              target: [spaceGrants.organizationId, spaceGrants.spaceId, spaceGrants.userId],
              set: change,
            })
            .returning()
        : await this.db
            .insert(listGrants)
            .values({
              organizationId,
              listId: resource.listId,
              spaceId: resource.spaceId,
              userId,
              role,
              grantedByType: actor.type,
              grantedById: actor.id,
            })
            .onConflictDoUpdate({
              target: [listGrants.organizationId, listGrants.listId, listGrants.userId],
              set: change,
            })
            .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('The grant was not stored.');
    }
    return toStoredGrant(row);
  }

  /**
   * Method remove
   *
   * @description
   * Deletes the grant of a person on a space or a list, by its primary key.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {GrantedResource} resource - The space or the list, locked by the caller.
   * @param {string} userId - The person.
   * @returns {Promise<void>} Resolves once deleted.
   */
  public async remove(
    organizationId: string,
    resource: GrantedResource,
    userId: string,
  ): Promise<void> {
    if (resource.kind === 'space') {
      await this.db
        .delete(spaceGrants)
        .where(
          and(
            eq(spaceGrants.organizationId, organizationId),
            eq(spaceGrants.spaceId, resource.spaceId),
            eq(spaceGrants.userId, userId),
          ),
        );
      return;
    }
    await this.db
      .delete(listGrants)
      .where(
        and(
          eq(listGrants.organizationId, organizationId),
          eq(listGrants.listId, resource.listId),
          eq(listGrants.userId, userId),
        ),
      );
  }

  /**
   * Method listOfMember
   *
   * @description
   * Reads the first grants of an account: its grants of spaces in the order of
   * `space_grants_user_index`, then, when they leave room, its grants of lists in the order of
   * `list_grants_user_index`, at most `limit` in all. Two short statements.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {number} limit - Most grants to return.
   * @returns {Promise<GrantedResource[]>} What the grants open, at most `limit`.
   */
  public async listOfMember(
    organizationId: string,
    userId: string,
    limit: number,
  ): Promise<GrantedResource[]> {
    const ofSpaces: { spaceId: string }[] = await this.db
      .select({ spaceId: spaceGrants.spaceId })
      .from(spaceGrants)
      .where(and(eq(spaceGrants.organizationId, organizationId), eq(spaceGrants.userId, userId)))
      .orderBy(asc(spaceGrants.spaceId))
      .limit(limit);
    const found: GrantedResource[] = ofSpaces.map((row: { spaceId: string }): GrantedResource => ({
      kind: 'space',
      spaceId: row.spaceId,
    }));
    if (found.length >= limit) {
      return found;
    }
    const ofLists: { spaceId: string; listId: string }[] = await this.db
      .select({ spaceId: listGrants.spaceId, listId: listGrants.listId })
      .from(listGrants)
      .where(and(eq(listGrants.organizationId, organizationId), eq(listGrants.userId, userId)))
      .orderBy(asc(listGrants.spaceId), asc(listGrants.listId))
      .limit(limit - found.length);
    return [
      ...found,
      ...ofLists.map((row: { spaceId: string; listId: string }): GrantedResource => ({
        kind: 'list',
        spaceId: row.spaceId,
        listId: row.listId,
      })),
    ];
  }

  /**
   * Method listOfMemberInSpaces
   *
   * @description
   * Reads every grant an account holds on some spaces and on their lists, grants of spaces first,
   * through the ranges `(organization_id, user_id, space_id)` of the two indexes of the grants of
   * a person. No space reads nothing.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} userId - The account.
   * @param {readonly string[]} spaceIds - The spaces.
   * @returns {Promise<GrantedResource[]>} What the grants open.
   */
  public async listOfMemberInSpaces(
    organizationId: string,
    userId: string,
    spaceIds: readonly string[],
  ): Promise<GrantedResource[]> {
    if (spaceIds.length === 0) {
      return [];
    }
    const ofSpaces: { spaceId: string }[] = await this.db
      .select({ spaceId: spaceGrants.spaceId })
      .from(spaceGrants)
      .where(
        and(
          eq(spaceGrants.organizationId, organizationId),
          eq(spaceGrants.userId, userId),
          inArray(spaceGrants.spaceId, [...spaceIds]),
        ),
      )
      .orderBy(asc(spaceGrants.spaceId));
    const ofLists: { spaceId: string; listId: string }[] = await this.db
      .select({ spaceId: listGrants.spaceId, listId: listGrants.listId })
      .from(listGrants)
      .where(
        and(
          eq(listGrants.organizationId, organizationId),
          eq(listGrants.userId, userId),
          inArray(listGrants.spaceId, [...spaceIds]),
        ),
      )
      .orderBy(asc(listGrants.spaceId), asc(listGrants.listId));
    return [
      ...ofSpaces.map((row: { spaceId: string }): GrantedResource => ({
        kind: 'space',
        spaceId: row.spaceId,
      })),
      ...ofLists.map((row: { spaceId: string; listId: string }): GrantedResource => ({
        kind: 'list',
        spaceId: row.spaceId,
        listId: row.listId,
      })),
    ];
  }
  // #endregion
}
