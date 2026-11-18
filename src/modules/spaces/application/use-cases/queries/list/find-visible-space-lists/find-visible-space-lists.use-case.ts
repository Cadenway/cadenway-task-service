import type { TaskList } from '../../../../../domain/aggregates/list/task-list.aggregate.js';
import type { Space } from '../../../../../domain/aggregates/space/space.aggregate.js';
import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import { toVisibleList } from '../../../../mappers/list/visible-list.mapper.js';
import type { SpacesStore } from '../../../../models/transactions/spaces-store.model.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import type { FindVisibleSpaceListsInput } from './find-visible-space-lists.input.js';
import type { FindVisibleSpaceListsOutput } from './find-visible-space-lists.output.js';

/**
 * Class FindVisibleSpaceLists
 *
 * @description
 * Public operation of the spaces module for the tasks module: every list and sprint of a space the
 * member sees, unpaged and in the order of their creation (the tasks module counts them all, then
 * pages). A space that does not exist, a space of another organization and a space the member does
 * not see (a guest sees none, a private space is seen by its owner only, a space awaiting an owner
 * by nobody: `Space.isVisibleTo`) all answer `null`, so no case tells another apart. The role of
 * the member comes from the caller, which read it from the copy of the memberships. It runs in
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
  }
  // #endregion

  // #region Methods
  /**
   * Method execute
   *
   * @description
   * Reads the space, checks that the member sees it, then reads its lists.
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
        const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
        if (!space?.isVisibleTo(viewer)) {
          return null;
        }
        const lists: TaskList[] = await store.lists.listAllOfSpace(
          input.organizationId,
          input.spaceId,
        );
        return { lists: lists.map((list: TaskList) => toVisibleList(list.snapshot)) };
      },
    );
  }
  // #endregion
}
