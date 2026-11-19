import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { GrantsUpdate } from '../../../../../domain/value-objects/access/grants-update.value-object.js';
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
import type { RemoveListGrantInput } from './remove-list-grant.input.js';
import type { RemoveListGrantOutput } from './remove-list-grant.output.js';

/**
 * Class RemoveListGrant
 *
 * @description
 * Removes the grant of a person on a list ("Retirer l’accès",
 * `DELETE /internal/v1/lists/{listId}/grants/{userId}`, "removeListGrant" of
 * `openapi/public/access.yaml`): they keep what the rule of the organization or a grant of the
 * space gives them. Locks the membership of the actor, then the space of the list `FOR SHARE`,
 * then the list `FOR NO KEY UPDATE`. Refusals, in this order: `list-not-found`,
 * `role-insufficient` without `edit` on the list, `version-mismatch`, then `owner-unchangeable`
 * for the owner of the space. A person without a grant answers the same version, with nothing
 * written or emitted. A removal deletes the grant, takes the next version of the list and appends
 * `list.access-changed.v1` (`changed: ['grants']`) with every grant left and `changedUserIds` the
 * person, in one tenant transaction.
 */
export class RemoveListGrant {
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
    this.guard = new GrantGuard();
    this.keeper = new GrantKeeper();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Removes the grant.
   *
   * @param {RemoveListGrantInput} input - The actor, the list, the person and the versions
   * `If-Match` accepts.
   * @returns {Promise<RemoveListGrantOutput>} The version of the list after the change.
   * @throws {SpaceRefusal} `organization-not-found`, `list-not-found`, `role-insufficient`,
   * `version-mismatch` or `owner-unchangeable`.
   */
  public async execute(input: RemoveListGrantInput): Promise<RemoveListGrantOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<RemoveListGrantOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
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
        this.keeper.restore(resource, space.snapshot.ownerUserId, stored).remove(input.userId),
      );
      if (!update.changed) {
        return { version: list.snapshot.version };
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      await store.grants.remove(input.organizationId, resource, input.userId);
      const next: TaskList = list.recordAccessChange();
      await store.lists.update(next);
      await store.events.listAccessChanged(
        next,
        update.grants.snapshot.grants,
        ['grants'],
        [input.userId],
        actor,
      );
      return { version: next.snapshot.version };
    });
  }
  // #endregion
}
