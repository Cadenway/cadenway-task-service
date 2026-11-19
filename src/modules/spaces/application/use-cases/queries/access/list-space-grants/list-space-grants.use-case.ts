import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { StoredGrant } from '../../../../models/access/stored-grant.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { GrantPager } from '../../../../services/access/grant-pager.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import type { ListSpaceGrantsInput } from './list-space-grants.input.js';
import type { ListSpaceGrantsOutput } from './list-space-grants.output.js';

/**
 * Class ListSpaceGrants
 *
 * @description
 * Lists the people a space is shared with and their roles (`GET /internal/v1/spaces/{spaceId}/grants`),
 * in the order they were first given access, with `total` on every page. Whoever sees the space
 * reads them, through some of its lists only included ("listSpaceGrants" of
 * `openapi/public/access.yaml`); any other answers `space-not-found`. Every grant of the space (200
 * at most) is read in one statement and the page is cut in memory. One tenant transaction, read
 * only.
 */
export class ListSpaceGrants {
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
   * Decides whether the actor sees the space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;

  /**
   * Property pages
   *
   * @description
   * Cuts the page of grants.
   *
   * @type {GrantPager}
   * @readonly
   */
  private readonly pages: GrantPager;
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
    this.pages = new GrantPager();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads a page of the grants of the space.
   *
   * @param {ListSpaceGrantsInput} input - The actor, the space, the start of the page and its size.
   * @returns {Promise<ListSpaceGrantsOutput>} The page.
   * @throws {SpaceRefusal} `organization-not-found` or `space-not-found`.
   */
  public async execute(input: ListSpaceGrantsInput): Promise<ListSpaceGrantsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListSpaceGrantsOutput> => {
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
      const grants: StoredGrant[] = await store.grants.listOf(input.organizationId, {
        kind: 'space',
        spaceId: space.snapshot.id,
      });
      return this.pages.page(grants, input.after, input.limit);
    });
  }
  // #endregion
}
