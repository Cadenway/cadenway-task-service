import { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import { canCreateSpace } from '../../../../../domain/policies/access/access-role.policy.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { EventActor } from '../../../../models/actor/event-actor.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';
import type { CreateSpaceInput } from './create-space.input.js';
import type { CreateSpaceOutput } from './create-space.output.js';

/**
 * Constant FIRST_LIST_NAME
 *
 * @description
 * The name of the list created with every space: "Première liste" in the toast "Espace créé" of
 * the mockup ("Ressources humaines · une première liste est prête.") and in the description of
 * `createSpace` in `openapi/public/spaces.yaml`.
 */
const FIRST_LIST_NAME = 'Première liste';

/**
 * Class CreateSpace
 *
 * @description
 * Creates a space owned by the actor, with its default statuses, its prefix and a first list
 * (`POST /internal/v1/spaces`). Everything happens in one tenant transaction: the space, the claim
 * of its prefix, the first list, and `space.created.v1` then `list.created.v1` in the outbox. A
 * guest is refused (`role-forbidden`); a prefix another space of the organization uses or used is
 * refused (`prefix-taken`), which rolls the inserted space back. The viewer comes from the copy of
 * the memberships. The first list has its switch "Accès de l’organisation" on. The creator owns the
 * space: the answer carries `callerRole: 'edit'` and `callerCanManage: true` without a reading of
 * the grants, which a new space has none of. Rules: "Who changes what" and "Prefixes and keys" of
 * `openapi/public/spaces.yaml`.
 */
export class CreateSpace {
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
   * Property views
   *
   * @description
   * Adds the next key to the space.
   *
   * @type {SpaceViewBuilder}
   * @readonly
   */
  private readonly views: SpaceViewBuilder;
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
    this.views = new SpaceViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Creates the space and its first list.
   *
   * @param {CreateSpaceInput} input - The validated request of the actor.
   * @returns {Promise<CreateSpaceOutput>} The space with its next key, and its first list.
   * @throws {SpaceRefusal} `organization-not-found`, `role-forbidden` or `prefix-taken`.
   * @throws {InvalidSpaceError} When the domain refuses a field the API layer let through.
   */
  public async execute(input: CreateSpaceInput): Promise<CreateSpaceOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<CreateSpaceOutput> => {
      const viewer: Viewer = await this.viewers.resolve(
        input.organizationId,
        input.actorUserId,
        true,
      );
      if (!canCreateSpace(viewer)) {
        throw new SpaceRefusal({ reason: 'role-forbidden' });
      }
      const actor: EventActor = { type: 'user', id: input.actorUserId };
      const space: Space = await store.spaces.insert(
        Space.create({
          organizationId: input.organizationId,
          ownerUserId: input.actorUserId,
          name: input.name,
          prefix: input.prefix,
          description: input.description,
          icon: input.icon,
          color: input.color,
          visibility: input.visibility,
        }),
      );
      const claimed: boolean = await store.prefixes.claim(
        input.organizationId,
        space.snapshot.prefix,
        space.snapshot.id,
      );
      if (!claimed) {
        throw new SpaceRefusal({ reason: 'prefix-taken', prefix: space.snapshot.prefix });
      }
      const firstList: TaskList = await store.lists.insert(
        TaskList.create({
          organizationId: input.organizationId,
          spaceId: space.snapshot.id,
          name: FIRST_LIST_NAME,
          icon: null,
          color: 'gris',
          sprint: null,
          organizationAccess: true,
        }),
      );
      await store.events.spaceCreated(space, actor);
      await store.events.listCreated(firstList, actor);
      const view: SpaceView = await this.views.buildOne(
        store.prefixes,
        input.organizationId,
        space.snapshot,
        { callerRole: 'edit', callerCanManage: true },
      );
      return { space: view, firstList: { list: firstList.snapshot, callerRole: 'edit' } };
    });
  }
  // #endregion
}
