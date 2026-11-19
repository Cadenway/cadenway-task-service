import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantGuard } from '../../../../services/access/grant-guard.service.js';
import { GrantKeeper } from '../../../../services/access/grant-keeper.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { SetSpaceGrantInput } from './set-space-grant.input.js';
import type { SetSpaceGrantOutput } from './set-space-grant.output.js';

/**
 * Class SetSpaceGrant
 *
 * @description
 * Gives a person a role on a space and every list of it, or changes the role they hold there
 * (`PUT /internal/v1/spaces/{spaceId}/grants/{userId}`, "setSpaceGrant" of
 * `openapi/public/access.yaml`). Locks, in this order: the membership of the actor, then the one
 * of the person `FOR SHARE` (a concurrent removal waits, and its clean-up sees the grant), then the
 * space `FOR NO KEY UPDATE`. Refusals, in this order: `space-not-found`, `manage-forbidden`,
 * `version-mismatch`, then the rules of `ResourceGrants.give` (`grantee-invalid`,
 * `owner-unchangeable`, `guest-space-forbidden`, `grant-limit-reached`). The same role again
 * answers the grant and the version as they are, with nothing written or emitted. A change writes
 * the grant (when first given and by whom stay; the instant and the actor of this role are
 * written), takes the next version of the space and appends `space.access-changed.v1` with every
 * grant after it and `changedUserIds` the person, in one tenant transaction.
 */
export class SetSpaceGrant {
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
   * Property viewers
   *
   * @description
   * Resolves the acting member.
   *
   * @type {ViewerResolver}
   * @readonly
   */
  private readonly viewers: ViewerResolver;

  /**
   * Property members
   *
   * @description
   * The copy of the memberships, for the role of the person given access.
   *
   * @type {MemberDirectory}
   * @readonly
   */
  private readonly members: MemberDirectory;

  /**
   * Property guard
   *
   * @description
   * Locks the space and checks that the actor manages it.
   *
   * @type {GrantGuard}
   * @readonly
   */
  private readonly guard: GrantGuard;

  /**
   * Property keeper
   *
   * @description
   * Loads, changes and stores the grants of the space.
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
    this.viewers = new ViewerResolver(members);
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
   * Gives or changes the grant.
   *
   * @param {SetSpaceGrantInput} input - The actor, the space, the person, the role and the
   * versions `If-Match` accepts.
   * @returns {Promise<SetSpaceGrantOutput>} The grant and the version of the space.
   * @throws {SpaceRefusal} `organization-not-found`, `space-not-found`, `manage-forbidden`,
   * `version-mismatch`, `grantee-invalid`, `owner-unchangeable`, `guest-space-forbidden` or
   * `grant-limit-reached`.
   */
  public async execute(input: SetSpaceGrantInput): Promise<SetSpaceGrantOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<SetSpaceGrantOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const granteeRole: MemberRole | null = await this.members.roleOf(
        input.organizationId,
        input.userId,
        true,
      );
      const space: Space = await this.guard.lockManagedSpace(
        store,
        input.organizationId,
        viewer,
        input.spaceId,
        input.expectedVersions,
      );
      const resource: GrantedResource = { kind: 'space', spaceId: space.snapshot.id };
      const stored: StoredGrant[] = await store.grants.listOf(input.organizationId, resource);
      const update: GrantsUpdate = this.keeper.apply(() =>
        this.keeper
          .restore(resource, space.snapshot.ownerUserId, stored)
          .give({ userId: input.userId, role: input.role, granteeRole }),
      );
      if (!update.changed) {
        return { grant: this.keeper.held(stored, input.userId), version: space.snapshot.version };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const grant: StoredGrant = await store.grants.put(
        input.organizationId,
        resource,
        input.userId,
        input.role,
        actor,
      );
      const next: Space = space.recordAccessChange();
      await store.spaces.update(next);
      await store.events.spaceAccessChanged(
        next,
        update.grants.snapshot.grants,
        [input.userId],
        actor,
      );
      return { grant, version: next.snapshot.version };
    });
  }
  // #endregion
}
