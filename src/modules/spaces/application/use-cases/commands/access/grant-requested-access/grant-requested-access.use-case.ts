import type { ResourceGrants } from '../../../../../domain/aggregates/access/resource-grants.aggregate.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantGuard } from '../../../../services/access/grant-guard.service.js';
import { GrantKeeper } from '../../../../services/access/grant-keeper.service.js';
import type { GrantRequestedAccessInput } from './grant-requested-access.input.js';
import type { GrantRequestedAccessOutput } from './grant-requested-access.output.js';

/**
 * Class GrantRequestedAccess
 *
 * @description
 * Public operation of the spaces module for the access-requests module: the grant an approved
 * access request gives ("creates or raises the grant", decision 4 of P3b-1). It creates the grant,
 * raises a lower one, and keeps an equal or higher one (`changed: false`), with the rules of
 * `ResourceGrants.raise`; a rule that refuses it answers `refused` with that rule, and a space or a
 * list the organization no longer has `not-found`, without a throw, so that the caller decides
 * what to roll back. The caller checked that the actor answers requests for the target. Locks, in
 * this order: the membership of the requester `FOR SHARE`, then the space `FOR NO KEY UPDATE`, or
 * for a list its space `FOR SHARE` then the list `FOR NO KEY UPDATE`. A change writes the grant,
 * takes the next version of the space or the list and appends `space.access-changed.v1` or
 * `list.access-changed.v1` with the actor `{ type: 'user', id: actorUserId }`. It runs in
 * `SpacesUnitOfWork.run`, which joins the transaction of the caller.
 */
export class GrantRequestedAccess {
  // #region Properties
  /**
   * Property unitOfWork
   *
   * @description
   * The tenant transaction of the use case.
   *
   * @type {SpacesUnitOfWork}
   * @readonly
   */
  private readonly unitOfWork: SpacesUnitOfWork;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships, for the role of the requester.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

  /**
   * Property guard
   *
   * @description
   * Locks a list after its space.
   *
   * @type {GrantGuard}
   * @readonly
   */
  private readonly guard: GrantGuard;

  /**
   * Property keeper
   *
   * @description
   * Loads and changes the grants of the target.
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
    this.guard = new GrantGuard();
    this.keeper = new GrantKeeper();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Gives or raises the grant of the requester.
   *
   * @param {GrantRequestedAccessInput} input - The actor, the target, the requester and the role.
   * @returns {Promise<GrantRequestedAccessOutput>} Whether the grant was given or refused.
   */
  public async execute(input: GrantRequestedAccessInput): Promise<GrantRequestedAccessOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<GrantRequestedAccessOutput> => {
      const granteeRole: MemberRole | null = await this.members.roleOf(
        input.organizationId,
        input.granteeUserId,
        true,
      );
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const target: GrantRequestedAccessInput['target'] = input.target;
      if (target.kind === 'space') {
        const space: Space | null = await store.spaces.lock(input.organizationId, target.spaceId);
        if (space === null) {
          return { outcome: 'refused', reason: 'not-found' };
        }
        const resource: GrantedResource = { kind: 'space', spaceId: space.snapshot.id };
        const raised: GrantsUpdate | GrantRequestedAccessOutput = await this.raise(
          store,
          input,
          resource,
          space.snapshot.ownerUserId,
          granteeRole,
        );
        if (!('grants' in raised)) {
          return raised;
        }
        if (raised.changed) {
          const next: Space = space.recordAccessChange();
          await store.spaces.update(next);
          await store.events.spaceAccessChanged(
            next,
            raised.grants.snapshot.grants,
            [input.granteeUserId],
            actor,
          );
        }
        return { outcome: 'granted', changed: raised.changed };
      }
      const locked: { readonly space: Space; readonly list: TaskList } | null =
        await this.guard.lockList(store, input.organizationId, target.listId);
      if (locked === null) {
        return { outcome: 'refused', reason: 'not-found' };
      }
      const resource: GrantedResource = {
        kind: 'list',
        spaceId: locked.list.snapshot.spaceId,
        listId: locked.list.snapshot.id,
      };
      const raised: GrantsUpdate | GrantRequestedAccessOutput = await this.raise(
        store,
        input,
        resource,
        locked.space.snapshot.ownerUserId,
        granteeRole,
      );
      if (!('grants' in raised)) {
        return raised;
      }
      if (raised.changed) {
        const next: TaskList = locked.list.recordAccessChange();
        await store.lists.update(next);
        await store.events.listAccessChanged(
          next,
          raised.grants.snapshot.grants,
          ['grants'],
          [input.granteeUserId],
          actor,
        );
      }
      return { outcome: 'granted', changed: raised.changed };
    });
  }

  /**
   * Method raise
   *
   * @description
   * Raises the grant of the requester on the locked target and stores it when it changed.
   *
   * @param {SpacesStore} store - The store of the transaction.
   * @param {GrantRequestedAccessInput} input - The request.
   * @param {GrantedResource} resource - The locked space or list.
   * @param {string} ownerUserId - The owner of the space.
   * @param {MemberRole | null} granteeRole - The role of the requester in the organization.
   * @returns {Promise<GrantsUpdate | GrantRequestedAccessOutput>} The grants after the change, or
   * the refusal to answer.
   */
  private async raise(
    store: SpacesStore,
    input: GrantRequestedAccessInput,
    resource: GrantedResource,
    ownerUserId: string,
    granteeRole: MemberRole | null,
  ): Promise<GrantsUpdate | GrantRequestedAccessOutput> {
    const stored: StoredGrant[] = await store.grants.listOf(input.organizationId, resource);
    const grants: ResourceGrants = this.keeper.restore(resource, ownerUserId, stored);
    let update: GrantsUpdate;
    try {
      update = this.keeper.apply(() =>
        grants.raise({ userId: input.granteeUserId, role: input.role, granteeRole }),
      );
    } catch (error: unknown) {
      if (error instanceof SpaceRefusal) {
        switch (error.refusal.reason) {
          case 'grantee-invalid':
          case 'guest-space-forbidden':
          case 'owner-unchangeable':
          case 'grant-limit-reached':
            return { outcome: 'refused', reason: error.refusal.reason };
          default:
            throw error;
        }
      }
      throw error;
    }
    if (update.changed && update.role !== null) {
      await store.grants.put(input.organizationId, resource, input.granteeUserId, update.role, {
        type: 'user',
        id: input.actorUserId,
      });
    }
    return update;
  }
  // #endregion
}
