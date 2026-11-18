import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../../../../domain/value-objects/space/space-state.value-object.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { ListSpacesInput } from './list-spaces.input.js';
import type { ListSpacesOutput } from './list-spaces.output.js';

/**
 * Class ListSpaces
 *
 * @description
 * Lists the spaces the actor sees (`GET /internal/v1/spaces`), in the order of their creation: the
 * spaces open to the whole organization and the private ones the actor owns. A guest gets an empty
 * page in this version ("Who sees a space" of `openapi/public/spaces.yaml`). It reads one row more
 * than the page to know whether a next page exists, and the next keys of the page with one reading
 * of the counters. It runs in one tenant transaction, scoped to the organization of the context.
 */
export class ListSpaces {
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
   * Adds the next key to the spaces.
   *
   * @type {SpaceViewBuilder}
   * @readonly
   */
  private readonly views: SpaceViewBuilder;

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
    this.views = new SpaceViewBuilder();
    this.pages = new PageSlicer();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads a page of the spaces.
   *
   * @param {ListSpacesInput} input - The actor, the start of the page and its size (at least 1).
   * @returns {Promise<ListSpacesOutput>} The page, with where the next one starts.
   * @throws {SpaceRefusal} `organization-not-found` when the actor is not a current member.
   */
  public async execute(input: ListSpacesInput): Promise<ListSpacesOutput> {
    return this.unitOfWork.run(async (store: SpacesStore): Promise<ListSpacesOutput> => {
      const viewer: Viewer = await this.viewers.resolve(input.organizationId, input.actorUserId);
      if (viewer.role === 'guest') {
        return { items: [], next: null };
      }
      const rows: Space[] = await store.spaces.listVisible(
        input.organizationId,
        input.actorUserId,
        input.after,
        input.limit + 1,
      );
      const page: Slice<SpaceState> = this.pages.slice(
        rows.map((row: Space): SpaceState => row.snapshot),
        input.limit,
      );
      const items: SpaceView[] = await this.views.build(
        store.prefixes,
        input.organizationId,
        page.items,
      );
      return { items, next: page.next };
    });
  }
  // #endregion
}
