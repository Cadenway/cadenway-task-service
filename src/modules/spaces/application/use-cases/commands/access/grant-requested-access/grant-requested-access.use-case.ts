import { canManageListAccess } from '../../../../../domain/policies/access/access-role.policy.js';
import type { ResourceGrants } from '../../../../../domain/aggregates/access/resource-grants.aggregate.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { CheckedLock } from '../../../../models/access/checked-lock.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { CheckedLocker } from '../../../../services/access/checked-locker.service.js';
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
 * `ResourceGrants.raise`: an approval raises a role and never lowers one. Every refusal answers
 * `refused` without a throw and writes nothing, so that the caller decides what to roll back:
 * `not-found` for a space or a list the organization no longer has, `manage-forbidden` when the
 * actor no longer answers requests for it, then the rules of the grant. Locks, in this order: the
 * membership of the requester `FOR SHARE`, then the space `FOR NO KEY UPDATE`, or for a list its
 * space `FOR SHARE` then the list `FOR NO KEY UPDATE`. It checks, with the role of the actor the
 * caller read in the same transaction, that the actor manages the space (`canManageSpace`) or the
 * access of the list (`canManageListAccess`) on the rows read without lock first, then again on
 * the locked rows when they changed meanwhile (`CheckedLocker`): a grant given meanwhile could
 * have taken that right away. A change
 * writes the grant, takes the next version of the space or the list and appends
 * `space.access-changed.v1` or `list.access-changed.v1` with the actor
 * `{ type: 'user', id: actorUserId }`. It runs in `SpacesUnitOfWork.run`, which joins the
 * transaction of the caller.
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
   * Property locker
   *
   * @description
   * Checks the actor before the lock, and again on a row that changed.
   *
   * @type {CheckedLocker}
   * @readonly
   */
  private readonly locker: CheckedLocker;

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

  /**
   * Property access
   *
   * @description
   * Decides, on the locked rows, whether the actor answers requests for the target.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
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
    this.locker = new CheckedLocker();
    this.keeper = new GrantKeeper();
    this.access = new AccessResolver();
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
        const checked: CheckedLock<Space, GrantRequestedAccessOutput> = await this.locker.space(
          store,
          input.organizationId,
          target.spaceId,
          'update',
          async (seen: Space): Promise<GrantRequestedAccessOutput | null> => {
            const access: ViewerAccess = await this.access.resolve(
              store.grants,
              { userId: input.actorUserId, role: input.actorRole },
              seen.snapshot,
              null,
            );
            return access.canManage ? null : { outcome: 'refused', reason: 'manage-forbidden' };
          },
        );
        if (checked.outcome === 'unknown') {
          return { outcome: 'refused', reason: 'not-found' };
        }
        if (checked.outcome === 'refused') {
          return checked.refusal;
        }
        const space: Space = checked.locked;
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
      const checked: CheckedLock<
        { readonly space: Space; readonly list: TaskList },
        GrantRequestedAccessOutput
      > = await this.locker.list(
        store,
        input.organizationId,
        target.listId,
        async (
          seenSpace: Space,
          seenList: TaskList,
        ): Promise<GrantRequestedAccessOutput | null> => {
          const access: ViewerAccess = await this.access.resolve(
            store.grants,
            { userId: input.actorUserId, role: input.actorRole },
            seenSpace.snapshot,
            seenList.snapshot,
          );
          return canManageListAccess(access.listRole)
            ? null
            : { outcome: 'refused', reason: 'manage-forbidden' };
        },
      );
      if (checked.outcome === 'unknown') {
        return { outcome: 'refused', reason: 'not-found' };
      }
      if (checked.outcome === 'refused') {
        return checked.refusal;
      }
      const locked: { readonly space: Space; readonly list: TaskList } = checked.locked;
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
