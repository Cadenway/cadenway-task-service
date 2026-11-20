import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { announcesChanges } from '../../../../../domain/policies/list/list-state.policy.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantKeeper } from '../../../../services/access/grant-keeper.service.js';
import type { RemoveMemberGrantsInput } from './remove-member-grants.input.js';
import type { RemoveMemberGrantsOutput } from './remove-member-grants.output.js';

/**
 * Constant REMOVE_GRANTS_BATCH_SIZE
 *
 * @description
 * How many grants of a former member one batch removes, in one tenant transaction (decision 11 of
 * P3b-1): each costs a reading of the grants of its space or list (200 at most), a delete, an
 * update of the version and an outbox append, and each space a lock of its own, so a full batch is
 * about 500 short statements, under the 10 s statement timeout of the application role, and a
 * request waits for a space or a list of a batch at most its 5 s lock timeout.
 *
 * @type {number}
 */
const REMOVE_GRANTS_BATCH_SIZE: number = 100;

/**
 * Constant SYSTEM_ACTOR
 *
 * @description
 * The actor of the clean-up: nobody acts through the API, task-service itself removes the grants
 * (`Actor` of `asyncapi/task-service.yaml`).
 *
 * @type {EventActor}
 */
const SYSTEM_ACTOR: EventActor = Object.freeze({ type: 'system', id: 'task-service' });

/**
 * Function byId
 *
 * @description
 * The distinct ids, sorted: the order every batch locks its lists in.
 *
 * @param {readonly string[]} ids - The ids.
 * @returns {string[]} The distinct ids in order.
 */
function byId(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort();
}

/**
 * Class RemoveMemberGrants
 *
 * @description
 * Public operation of the spaces module for the member-lifecycle module: one batch of the removal
 * of the grants of a member who left the organization ("Members" of
 * `openapi/internal/task-service.yaml`: reaction to `member.removed.v1`). The clean-up job calls
 * it after the removal committed, until it answers `none-left` or `member-again`; each call runs
 * in one tenant transaction, which `run` opens:
 *
 * 1. it reads at most 100 grants of the account, its grants of spaces first, then of lists;
 * 2. it locks their spaces one by one in the order `(created_at, id)` of the handover, `FOR NO
 *    KEY UPDATE` the spaces whose grant goes and `FOR SHARE` the spaces of the lists whose grant
 *    goes (only those lists take a version), then the lists `FOR NO KEY UPDATE` in the order of
 *    their ids;
 * 3. then it reads the copy of the memberships without lock: when the copy holds the account as a
 *    member again, it writes nothing (`member-again`), so a person who joined again keeps them;
 * 4. otherwise it removes each grant (`ResourceGrants.revoke`, which never refuses), takes the
 *    next version of its space or list and appends `space.access-changed.v1` or
 *    `list.access-changed.v1` with the actor `{ type: 'system', id: 'task-service' }`; a deleted
 *    space or list (a tombstone) is changed and announced all the same (`announcesChanges`), so
 *    that the person leaves the set of who reaches it of every consumer.
 *
 * A removed grant leaves the range of step 1, so the next call goes on with the next ones; a call
 * once none is left changes nothing: the removal is idempotent. A batch rolls back alone.
 */
export class RemoveMemberGrants {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of each batch.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships, read after the locks.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

  /**
   * Property keeper
   *
   * @description
   * Loads and changes the grants of a space or a list.
   *
   * @type {GrantKeeper}
   * @readonly
   */
  private readonly keeper: GrantKeeper;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port and the directory of the members.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @param {MemberDirectory} members - The copy of the memberships.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork, members: MemberDirectory) {
    this.unitOfWork = unitOfWork;
    this.members = members;
    this.keeper = new GrantKeeper();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Removes one batch of the grants of the former member.
   *
   * @param {RemoveMemberGrantsInput} input - The organization and the member who left.
   * @returns {Promise<RemoveMemberGrantsOutput>} What the batch did.
   * @throws {Error} When the database fails, a lock or statement timeout included: the batch rolls
   * back alone, and the job retries it; or when a grant names a space or a list the batch did not
   * lock, a defect the foreign keys rule out.
   */
  public async execute(input: RemoveMemberGrantsInput): Promise<RemoveMemberGrantsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<RemoveMemberGrantsOutput> => {
      const batch: GrantedResource[] = await store.grants.listOfMember(
        input.organizationId,
        input.userId,
        REMOVE_GRANTS_BATCH_SIZE,
      );
      if (batch.length === 0) {
        return { outcome: 'none-left' };
      }
      // The spaces whose grant goes take the next version: FOR NO KEY UPDATE; the spaces of the
      // lists whose grant goes only keep their owner: FOR SHARE. In the order of the handover.
      const updated: ReadonlySet<string> = new Set(
        batch.flatMap((resource: GrantedResource): string[] =>
          resource.kind === 'space' ? [resource.spaceId] : [],
        ),
      );
      const spaces = new Map<string, Space>(
        (
          await store.spaces.lockInOrder(
            input.organizationId,
            [...new Set(batch.map((resource: GrantedResource): string => resource.spaceId))].map(
              (id: string): { readonly id: string; readonly mode: 'update' | 'share' } => ({
                id,
                mode: updated.has(id) ? 'update' : 'share',
              }),
            ),
          )
        ).map((space: Space): [string, Space] => [space.snapshot.id, space]),
      );
      const lists = new Map<string, TaskList>(
        (
          await store.lists.lockMany(
            input.organizationId,
            byId(
              batch.flatMap((resource: GrantedResource): string[] =>
                resource.kind === 'list' ? [resource.listId] : [],
              ),
            ),
          )
        ).map((list: TaskList): [string, TaskList] => [list.snapshot.id, list]),
      );
      // Read after the locks, so that a re-join committed before them is seen.
      if ((await this.members.roleOf(input.organizationId, input.userId)) !== null) {
        return { outcome: 'member-again' };
      }
      let removed: number = 0;
      for (const resource of batch) {
        const space: Space = this.lockedOf(spaces, resource.spaceId, 'space');
        const list: TaskList | null =
          resource.kind === 'list' ? this.lockedOf(lists, resource.listId, 'list') : null;
        const stored: StoredGrant[] = await store.grants.listOf(input.organizationId, resource);
        const update: GrantsUpdate = this.keeper
          .restore(resource, space.snapshot.ownerUserId, stored)
          .revoke(input.userId);
        if (!update.changed) {
          continue;
        }
        await store.grants.remove(input.organizationId, resource, input.userId);
        removed += 1;
        if (list === null) {
          const next: Space = space.recordAccessChange();
          await store.spaces.update(next);
          spaces.set(resource.spaceId, next);
          // A tombstone takes its version and announces who lost it all the same.
          if (announcesChanges('access', next.snapshot)) {
            await store.events.spaceAccessChanged(
              next,
              update.grants.snapshot.grants,
              [input.userId],
              SYSTEM_ACTOR,
            );
          }
          continue;
        }
        const next: TaskList = list.recordAccessChange();
        await store.lists.update(next);
        if (announcesChanges('access', space.snapshot, next.snapshot)) {
          await store.events.listAccessChanged(
            next,
            update.grants.snapshot.grants,
            ['grants'],
            [input.userId],
            SYSTEM_ACTOR,
          );
        }
      }
      return { outcome: 'removed', removed };
    });
  }

  /**
   * Method lockedOf
   *
   * @description
   * The locked row of a space or a list a grant of the batch names.
   *
   * @param {ReadonlyMap<string, TRow>} locked - The rows the batch locked, by id.
   * @param {string} id - The id the grant names.
   * @param {'space' | 'list'} kind - What it names, for the message.
   * @returns {TRow} The locked row.
   * @throws {Error} When it was not locked: a defect, since the foreign keys of the grant tables
   * keep every grant on an existing space and list; the batch rolls back.
   */
  private lockedOf<TRow>(
    locked: ReadonlyMap<string, TRow>,
    id: string,
    kind: 'space' | 'list',
  ): TRow {
    const row: TRow | undefined = locked.get(id);
    if (row === undefined) {
      throw new Error(`A grant of the batch names a ${kind} the batch did not lock.`);
    }
    return row;
  }
  // #endregion
}
