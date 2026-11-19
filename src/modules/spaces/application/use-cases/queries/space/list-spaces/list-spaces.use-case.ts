import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceState } from '../../../../../domain/value-objects/space/space-state.value-object.js';
import type { SpaceWithGrants } from '../../../../models/access/space-with-grants.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { Slice } from '../../../../models/page/slice.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { SpaceView } from '../../../../projections/space/space-view.projection.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import { ViewerResolver } from '../../../../services/member/viewer-resolver.service.js';
import { PageSlicer } from '../../../../services/page/page-slicer.service.js';
import { SpaceViewBuilder } from '../../../../services/space/space-view-builder.service.js';
import type { ListSpacesInput } from './list-spaces.input.js';
import type { ListSpacesOutput } from './list-spaces.output.js';

/**
 * Class ListSpaces
 *
 * @description
 * Lists the spaces the actor sees (`GET /internal/v1/spaces`), in the order of their creation,
 * each with the role of the actor on it and whether they manage it: for a member who is not a
 * guest the spaces open to the whole organization, the ones they own and the ones shared with
 * them; for anyone, a guest included, the spaces of the lists shared with them
 * (`callerRole: null`). One query keeps these spaces with the grants of the actor there, and the
 * role of each row comes from the policies of the domain ("Who sees a space" of
 * `openapi/public/spaces.yaml`). It reads one row more than the page to know whether a next page
 * exists, and the next keys of the page with one reading of the counters. It runs in one tenant
 * transaction, scoped to the organization of the context.
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
   * Property access
   *
   * @description
   * Computes the access of the actor to each space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;

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
    this.access = new AccessResolver();
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
      const rows: SpaceWithGrants[] = await store.spaces.listVisible(
        input.organizationId,
        viewer,
        input.after,
        input.limit + 1,
      );
      const page: Slice<SpaceState> = this.pages.slice(
        rows.map((row: SpaceWithGrants): SpaceState => row.space.snapshot),
        input.limit,
      );
      const accesses = new Map<string, ViewerAccess>(
        rows.map((row: SpaceWithGrants): [string, ViewerAccess] => [
          row.space.snapshot.id,
          this.access.fromGrants(viewer, row.space.snapshot, null, row.grants),
        ]),
      );
      // The query keeps the spaces the policies let the actor see; one they refuse all the same is
      // left out (fail closed), without changing where the next page starts.
      const seen: SpaceState[] = page.items.filter(
        (space: SpaceState): boolean => accesses.get(space.id)?.seesSpace === true,
      );
      const items: SpaceView[] = await this.views.build(
        store.prefixes,
        input.organizationId,
        seen,
        (space: SpaceState): Pick<SpaceView, 'callerRole' | 'callerCanManage'> => ({
          callerRole: accesses.get(space.id)?.spaceRole ?? null,
          callerCanManage: accesses.get(space.id)?.canManage ?? false,
        }),
      );
      return { items, next: page.next };
    });
  }
  // #endregion
}
