import type { ResourceGrants } from '../../../domain/aggregates/access/resource-grants.aggregate.js';
import type { TaskList } from '../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../domain/aggregates/space/space.aggregate.js';
import { announcesChanges } from '../../../domain/policies/list/list-state.policy.js';
import type { GrantsUpdate } from '../../../domain/value-objects/access/grants-update.value-object.js';
import type { EventActor } from '../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../models/access/stored-grant.model.js';
import type { SpacesStore } from '../../models/transactions/spaces-store.model.js';
import { GrantKeeper } from './grant-keeper.service.js';

/**
 * Class OwnerGrantsRemover
 *
 * @description
 * Removes the grants the new owner of some spaces held on them and on their lists, in the change
 * that made them the owner (a handover to the owner of the organization): the owner of a space
 * holds no grant and always has `edit` there ("Grant" of `openapi/internal/task-service.yaml`),
 * and the grants of a space or a list that broke this rule could not be loaded again. The caller
 * locked the spaces; each list is locked after its space, the lock order of the module. A space
 * grant removed emits `space.access-changed.v1` with the version the handover took (one change,
 * one version, as for the switch of a list); a list grant takes the next version of its list and
 * emits `list.access-changed.v1`. A deleted space or list is locked and changed like any other
 * (the grants a tombstone keeps come back with it, and none may name the owner), but emits nothing
 * until it comes back: a consumer dropped it at `space.deleted.v1` or `list.deleted.v1`. Nothing is
 * read beyond one statement when the owner held none.
 */
export class OwnerGrantsRemover {
  // #region Properties
  /**
   * Property keeper
   *
   * @description
   * Loads the grants of a space or a list into the aggregate.
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
   * Builds the remover.
   *
   * @constructor
   */
  public constructor() {
    this.keeper = new GrantKeeper();
  }
  // #endregion

  // #region Methods
  /**
   * Method remove
   *
   * @description
   * Removes the grants the new owner held on the spaces handed over to them and on their lists.
   *
   * @param {SpacesStore} store - The store of the transaction of the handover.
   * @param {string} ownerUserId - The new owner of the spaces.
   * @param {readonly { readonly space: Space; readonly formerOwnerUserId: string }[]} handed - The
   * spaces after the handover, locked and stored, with their owner before it.
   * @param {EventActor} actor - Who made the change.
   * @returns {Promise<number>} How many grants were removed.
   */
  public async remove(
    store: SpacesStore,
    ownerUserId: string,
    handed: readonly { readonly space: Space; readonly formerOwnerUserId: string }[],
    actor: EventActor,
  ): Promise<number> {
    const first: { readonly space: Space } | undefined = handed[0];
    if (first === undefined) {
      return 0;
    }
    const organizationId: string = first.space.snapshot.organizationId;
    const held: GrantedResource[] = await store.grants.listOfMemberInSpaces(
      organizationId,
      ownerUserId,
      handed.map((entry): string => entry.space.snapshot.id),
    );
    let removed: number = 0;
    for (const resource of held) {
      const entry: { readonly space: Space; readonly formerOwnerUserId: string } | undefined =
        handed.find((candidate): boolean => candidate.space.snapshot.id === resource.spaceId);
      if (entry === undefined) {
        continue;
      }
      const stored: StoredGrant[] = await store.grants.listOf(organizationId, resource);
      // The aggregate is rebuilt with the owner before the handover, whom no grant names.
      const grants: ResourceGrants = this.keeper.restore(resource, entry.formerOwnerUserId, stored);
      const update: GrantsUpdate = grants.revoke(ownerUserId);
      if (!update.changed) {
        continue;
      }
      await store.grants.remove(organizationId, resource, ownerUserId);
      removed += 1;
      if (resource.kind === 'space') {
        if (announcesChanges(entry.space.snapshot)) {
          await store.events.spaceAccessChanged(
            entry.space,
            update.grants.snapshot.grants,
            [ownerUserId],
            actor,
          );
        }
        continue;
      }
      const list: TaskList | null = await store.lists.lockIncludingDeleted(
        organizationId,
        resource.listId,
        'update',
      );
      if (list === null) {
        continue;
      }
      const next: TaskList = list.recordAccessChange();
      await store.lists.update(next);
      if (announcesChanges(entry.space.snapshot, next.snapshot)) {
        await store.events.listAccessChanged(
          next,
          update.grants.snapshot.grants,
          ['grants'],
          [ownerUserId],
          actor,
        );
      }
    }
    return removed;
  }
  // #endregion
}
