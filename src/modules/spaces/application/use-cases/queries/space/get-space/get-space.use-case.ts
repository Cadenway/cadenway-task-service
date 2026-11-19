import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { GetSpaceInput } from './get-space.input.js';
import type { GetSpaceOutput } from './get-space.output.js';

/**
 * Class GetSpace
 *
 * @description
 * Reads one space the actor sees (`GET /internal/v1/spaces/{spaceId}`), with their role on it and
 * whether they manage it. A space that does not exist in the organization and a space the actor
 * does not see (a private space of someone else not shared with them, a space awaiting an owner)
 * get the same answer, `space-not-found`, so the existence of a private space does not leak. A
 * guest sees the space of a list shared with them, with `callerRole: null`. It runs in one tenant
 * transaction, scoped to the organization of the context; the grants of the actor are read in one
 * statement when the rule of the organization does not already give `edit`.
 */
export class GetSpace {
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
   * Property access
   *
   * @description
   * Decides what the actor reaches of the space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;

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
    this.access = new AccessResolver();
    this.views = new SpaceViewBuilder();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the space.
   *
   * @param {GetSpaceInput} input - The actor and the space.
   * @returns {Promise<GetSpaceOutput>} The space with its next key and the access of the actor.
   * @throws {SpaceRefusal} `organization-not-found` or `space-not-found`.
   */
  public async execute(input: GetSpaceInput): Promise<GetSpaceOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<GetSpaceOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const space: Space | null = await store.spaces.find(input.organizationId, input.spaceId);
      if (space === null) {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      const access: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        null,
      );
      if (!access.seesSpace) {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      return this.views.buildOne(store.prefixes, input.organizationId, space.snapshot, {
        callerRole: access.spaceRole,
        callerCanManage: access.canManage,
      });
    });
  }
  // #endregion
}
