import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { TaskListState } from '../../../../../domain/value-objects/list/task-list-state.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import { SpaceRefusal } from '../../../../models/space/space-refusal.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import type { ListListsInput } from './list-lists.input.js';
import type { ListListsOutput } from './list-lists.output.js';

/**
 * Class ListLists
 *
 * @description
 * Lists the lists and sprints of a space the actor sees (`GET /internal/v1/spaces/{spaceId}/lists`),
 * in the order of their creation. A space that does not exist or that the actor does not see
 * answers `space-not-found`. It reads one row more than the page to know whether a next page
 * exists. It runs in one tenant transaction, scoped to the organization of the context.
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
      if (!space?.isVisibleTo(viewer)) {
        throw new SpaceRefusal({ reason: 'space-not-found' });
      }
      const rows: TaskList[] = await store.lists.listOfSpace(
        input.organizationId,
        input.spaceId,
        input.after,
        input.limit + 1,
      );
      const page: Slice<TaskListState> = this.pages.slice(
        rows.map((row: TaskList): TaskListState => row.snapshot),
        input.limit,
      );
      return { items: page.items, next: page.next };
    });
  }
  // #endregion
}
