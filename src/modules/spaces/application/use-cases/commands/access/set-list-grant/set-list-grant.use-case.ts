import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
import type { MemberRole } from '../../../../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { GrantedResource } from '../../../../models/access/granted-resource.model.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { GrantGuard } from '../../../../services/access/grant-guard.service.js';
import { GrantKeeper } from '../../../../services/access/grant-keeper.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { SetListGrantInput } from './set-list-grant.input.js';
import type { SetListGrantOutput } from './set-list-grant.output.js';

/**
 * Class SetListGrant
 *
 * @description
 * Gives a person a role on a list ("Inviter"), or changes the role they hold there
 * (`PUT /internal/v1/lists/{listId}/grants/{userId}`, "setListGrant" of
 * `openapi/public/access.yaml`); a guest receives grants of lists. Locks, in this order: the
 * membership of the actor, then the one of the person `FOR SHARE` (a concurrent removal waits, and
 * its clean-up sees the grant), then the space of the list `FOR SHARE` (its owner, whom no grant
 * may name, cannot change meanwhile), then the list `FOR NO KEY UPDATE`. Refusals, in this order:
 * `list-not-found`, `role-insufficient` without `edit` on the list, `version-mismatch`, then the
 * rules of `ResourceGrants.give` (`grantee-invalid`, `owner-unchangeable`,
 * `grant-limit-reached`). The same role again answers the grant and the version as they are, with
 * nothing written or emitted. A change writes the grant with the space of the list, takes the
 * next version of the list and appends `list.access-changed.v1` (`changed: ['grants']`) with every
 * grant after it and `changedUserIds` the person, in one tenant transaction.
 */
export class SetListGrant {
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
   * Locks the list and checks that the actor has `edit` on it.
   *
   * @type {GrantGuard}
   * @readonly
   */
  private readonly guard: GrantGuard;

  /**
   * Property keeper
   *
   * @description
   * Loads, changes and stores the grants of the list.
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
   * @param {SetListGrantInput} input - The actor, the list, the person, the role and the versions
   * `If-Match` accepts.
   * @returns {Promise<SetListGrantOutput>} The grant and the version of the list.
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `role-insufficient`,
   * `version-mismatch`, `grantee-invalid`, `owner-unchangeable` or `grant-limit-reached`.
   */
  public async execute(input: SetListGrantInput): Promise<SetListGrantOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<SetListGrantOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      const grantee: { readonly memberId: string; readonly role: MemberRole } | null =
        await this.members.grantMembershipOf(input.organizationId, input.userId, true);
      const { space, list }: { readonly space: Space; readonly list: TaskList } =
        await this.guard.lockEditableList(
          store,
          input.organizationId,
          viewer,
          input.listId,
          input.expectedVersions,
        );
      const resource: GrantedResource = {
        kind: 'list',
        spaceId: list.snapshot.spaceId,
        listId: list.snapshot.id,
      };
      const stored: StoredGrant[] = await store.grants.listOf(input.organizationId, resource);
      const update: GrantsUpdate = this.keeper.apply(() =>
        this.keeper
          .restore(resource, space.snapshot.ownerUserId, stored)
          .give({ userId: input.userId, role: input.role, granteeRole: grantee?.role ?? null }),
      );
      if (!update.changed) {
        return { grant: this.keeper.held(stored, input.userId), version: list.snapshot.version };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      if (grantee === null) {
        throw new SpaceRefusal({ reason: 'grantee-invalid', userId: input.userId });
      }
      const grant: StoredGrant = await store.grants.put(
        input.organizationId,
        resource,
        input.userId,
        input.role,
        actor,
        grantee.memberId,
      );
      const next: TaskList = list.recordAccessChange();
      await store.lists.update(next);
      await store.events.listAccessChanged(
        next,
        update.grants.snapshot.grants,
        ['grants'],
        [input.userId],
        actor,
      );
      return { grant, version: next.snapshot.version };
    });
  }
  // #endregion
}
