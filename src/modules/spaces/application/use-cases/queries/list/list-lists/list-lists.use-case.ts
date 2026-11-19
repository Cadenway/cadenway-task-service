import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskListState } from '../../../../../domain/value-objects/list/task-list-state.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListListsInput } from './list-lists.input.js';
import type { ListListsOutput } from './list-lists.output.js';

/**
 * Class ListLists
 *
 * @description
 * Lists the lists and sprints of a space the actor sees (`GET /internal/v1/spaces/{spaceId}/lists`)
 * that they have a role on, in the order of their creation, each with that role: a person who sees
 * the space only through some of its lists gets those lists only. A space that does not exist or
 * that the actor does not see answers `space-not-found`. One query keeps the lists with the
 * grants of the actor, and the role of each row comes from `listRoleOf`. It reads one row more
 * than the page to know whether a next page exists. It runs in one tenant transaction, scoped to
 * the organization of the context.
 */
export class ListLists {
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
   * Cuts the page.
   *
   * @type {PageSlicer}
   * @readonly
   */
  private readonly pages: PageSlicer;
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
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads a page of the lists of the space.
   *
   * @param {ListListsInput} input - The actor, the space, the start of the page and its size (at
   * least 1).
   * @returns {Promise<ListListsOutput>} The page, with where the next one starts.
   * @throws {SpaceRefusal} `organization-not-found` or `space-not-found`.
   */
  public async execute(input: ListListsInput): Promise<ListListsOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListListsOutput> => {
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
      const rows: ListWithGrants[] = await store.lists.listOfSpaceVisibleTo(
        input.organizationId,
        input.spaceId,
        viewer,
        input.after,
        input.limit + 1,
      );
      const page: Slice<TaskListState> = this.pages.slice(
        rows.map((row: ListWithGrants): TaskListState => row.list.snapshot),
        input.limit,
      );
      return { items: toListViews(rows.slice(0, input.limit), viewer), next: page.next };
    });
  }
  // #endregion
}
