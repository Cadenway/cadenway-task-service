import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
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
import type { ListListGrantsInput } from './list-list-grants.input.js';
import type { ListListGrantsOutput } from './list-list-grants.output.js';

/**
 * Class ListListGrants
 *
 * @description
 * Lists the people a list is shared with and their roles (`GET /internal/v1/lists/{listId}/grants`,
 * "Personnes ayant accès"), in the order they were first given access, with `total` on every
 * page. Any role on the list reads them ("listListGrants" of `openapi/public/access.yaml`); a list
 * the actor has no role on answers `list-not-found`. The owner of the space and the grants of the
 * space are read from the space. Every grant of the list (200 at most) is read in one statement
 * and the page is cut in memory. One tenant transaction, read only.
 */
export class ListListGrants {
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
   * Decides whether the actor has a role on the list.
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
   * Reads a page of the grants of the list.
   *
   * @param {ListListGrantsInput} input - The actor, the list, the start of the page and its size.
   * @returns {Promise<ListListGrantsOutput>} The page.
   * @throws {SpaceRefusal} `organization-not-found` or `list-not-found`.
   */
  public async execute(input: ListListGrantsInput): Promise<ListListGrantsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListListGrantsOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      const list: TaskList | null = await store.lists.find(input.organizationId, input.listId);
      if (list === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const space: Space | null = await store.spaces.find(
        input.organizationId,
        list.snapshot.spaceId,
      );
      if (space === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const access: ViewerAccess = await this.access.resolve(
        store.grants,
        viewer,
        space.snapshot,
        list.snapshot,
      );
      if (access.listRole === null) {
        throw new SpaceRefusal({ reason: 'list-not-found' });
      }
      const grants: StoredGrant[] = await store.grants.listOf(input.organizationId, {
        kind: 'list',
        spaceId: list.snapshot.spaceId,
        listId: list.snapshot.id,
      });
      return this.pages.page(grants, input.after, input.limit);
    });
  }
  // #endregion
}
