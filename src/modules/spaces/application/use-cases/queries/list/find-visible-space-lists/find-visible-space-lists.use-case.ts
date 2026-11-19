import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toListViews } from '../../../../mappers/list/list-view.mapper.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { ListWithGrants } from '../../../../models/access/list-with-grants.model.js';
import type { ViewerAccess } from '../../../../models/access/viewer-access.model.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { ListView } from '../../../../projections/list/list-view.projection.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { FindVisibleSpaceListsInput } from './find-visible-space-lists.input.js';
import type { FindVisibleSpaceListsOutput } from './find-visible-space-lists.output.js';

/**
 * Class FindVisibleSpaceLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: the live lists and sprints of a
 * space the member sees that they have a role on, each with that role (`callerRole`), unpaged and
 * in their order in the space (`positionInSpaceOf`; the tasks module counts them all, then pages);
 * an archived list leaves the overview of its space ("Lists" of `openapi/public/archives.yaml`).
 * A space that does not
 * exist, a space of another organization and a space the member does not see (`canSeeSpace`: a
 * private space of another not shared with them, a guest without a grant of one of its lists, a
 * space awaiting an owner) all answer `null`, so no case tells another apart; a member who sees
 * the space only through some of its lists gets those lists. The role of the member in the
 * organization comes from the caller, which read it from the copy of the memberships. It runs in
 * `SpacesUnitOfWork.run`, which joins the tenant transaction of the caller, scoped to the
 * organization of the input; it takes no lock and appends no event.
 */
export class FindVisibleSpaceLists {
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
   * Property access
   *
   * @description
   * Decides whether the member sees the space.
   *
   * @type {AccessResolver}
   * @readonly
   */
  private readonly access: AccessResolver;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the transaction port.
   *
   * @param {SpacesUnitOfWork} unitOfWork - The tenant transaction.
   * @constructor
   */
  public constructor(unitOfWork: SpacesUnitOfWork) {
    this.unitOfWork = unitOfWork;
    this.access = new AccessResolver();
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the space, checks that the member sees it, then reads its lists they have a role on.
   *
   * @param {FindVisibleSpaceListsInput} input - The member, its role and the space.
   * @returns {Promise<FindVisibleSpaceListsOutput | null>} The lists of the space, or `null` when
   * the member does not see the space.
   */
  public async execute(
    input: FindVisibleSpaceListsInput,
  ): Promise<FindVisibleSpaceListsOutput | null> {
    return this.unitOfWork.run(
      async (store: SpacesStore): Promise<FindVisibleSpaceListsOutput | null> => {
        const space: Space | null = await store.spaces.find(input.organizationId, input.spaceId);
        if (space === null) {
          return null;
        }
        const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
        const access: ViewerAccess = await this.access.resolve(
          store.grants,
          viewer,
          space.snapshot,
          null,
        );
        if (!access.seesSpace) {
          return null;
        }
        const rows: ListWithGrants[] = await store.lists.listAllOfSpaceVisibleTo(
          input.organizationId,
          input.spaceId,
          viewer,
        );
        return {
          lists: toListViews(rows, viewer).map((view: ListView) =>
            toVisibleList(view.list, view.callerRole),
          ),
        };
      },
    );
  }
  // #endregion
}
