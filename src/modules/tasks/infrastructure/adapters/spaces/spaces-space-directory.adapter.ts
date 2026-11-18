import type {
  AllocateTaskKeys,
  AllocateTaskKeysOutput,
} from '../../../../spaces/public/space/allocate-task-keys.js';
import type {
  FindVisibleList,
  FindVisibleListOutput,
} from '../../../../spaces/public/list/find-visible-list.js';
import type {
  FindVisibleSpaceLists,
  FindVisibleSpaceListsOutput,
} from '../../../../spaces/public/list/find-visible-space-lists.js';
import type {
  ListCurrentSprints,
  ListCurrentSprintsOutput,
} from '../../../../spaces/public/list/list-current-sprints.js';
import type {
  ListSidebarLists,
  ListSidebarListsOutput,
  VisibleList,
} from '../../../../spaces/public/list/list-sidebar-lists.js';
import type {
  ListVisibleSpaceIds,
  ListVisibleSpaceIdsOutput,
} from '../../../../spaces/public/space/list-visible-space-ids.js';
import type { KeyAllocation } from '../../../application/models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../application/models/placement/list-placement.model.js';
import type { PlacedList } from '../../../application/models/placement/placed-list.model.js';
import type { SpaceDirectory } from '../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';

/**
 * Class SpacesSpaceDirectory
 *
 * @description
 * `SpaceDirectory` over the public operations `FindVisibleList`, `ListVisibleSpaceIds`,
 * `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists` and `AllocateTaskKeys` of the
 * spaces module, which join the tenant transaction of the calling use case. The projections of the spaces module are copied member by member to the models of the
 * tasks module, so neither module shares a type with the other. The viewer's role is the one the
 * copy of the memberships gave, passed as `viewerRole`.
 */
export class SpacesSpaceDirectory implements SpaceDirectory {
  // #region Properties
  /**
   * Property findVisibleList
   *
   * @description
   * The reading of a list and its space for a viewer.
   *
   * @type {FindVisibleList}
   * @readonly
   */
  private readonly findVisibleListOperation: FindVisibleList;

  /**
   * Property listVisibleSpaceIds
   *
   * @description
   * The reading of the spaces a viewer sees.
   *
   * @type {ListVisibleSpaceIds}
   * @readonly
   */
  private readonly listVisibleSpaceIds: ListVisibleSpaceIds;

  /**
   * Property findVisibleSpaceListsOperation
   *
   * @description
   * The reading of the lists of a space a viewer sees.
   *
   * @type {FindVisibleSpaceLists}
   * @readonly
   */
  private readonly findVisibleSpaceListsOperation: FindVisibleSpaceLists;

  /**
   * Property listCurrentSprints
   *
   * @description
   * The reading of the current sprints of the spaces a viewer sees.
   *
   * @type {ListCurrentSprints}
   * @readonly
   */
  private readonly listCurrentSprints: ListCurrentSprints;

  /**
   * Property listSidebarLists
   *
   * @description
   * The reading of the first lists of the sidebar of a viewer.
   *
   * @type {ListSidebarLists}
   * @readonly
   */
  private readonly listSidebarLists: ListSidebarLists;

  /**
   * Property allocateTaskKeys
   *
   * @description
   * The allocation of consecutive task numbers.
   *
   * @type {AllocateTaskKeys}
   * @readonly
   */
  private readonly allocateTaskKeys: AllocateTaskKeys;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the six public operations of the spaces module.
   *
   * @param {FindVisibleList} findVisibleList - The reading of a visible list.
   * @param {ListVisibleSpaceIds} listVisibleSpaceIds - The reading of the visible spaces.
   * @param {FindVisibleSpaceLists} findVisibleSpaceLists - The reading of the lists of a space.
   * @param {ListCurrentSprints} listCurrentSprints - The reading of the current sprints.
   * @param {ListSidebarLists} listSidebarLists - The reading of the lists of the sidebar.
   * @param {AllocateTaskKeys} allocateTaskKeys - The allocation of task numbers.
   * @constructor
   */
  public constructor(
    findVisibleList: FindVisibleList,
    listVisibleSpaceIds: ListVisibleSpaceIds,
    findVisibleSpaceLists: FindVisibleSpaceLists,
    listCurrentSprints: ListCurrentSprints,
    listSidebarLists: ListSidebarLists,
    allocateTaskKeys: AllocateTaskKeys,
  ) {
    this.findVisibleListOperation = findVisibleList;
    this.listVisibleSpaceIds = listVisibleSpaceIds;
    this.findVisibleSpaceListsOperation = findVisibleSpaceLists;
    this.listCurrentSprints = listCurrentSprints;
    this.listSidebarLists = listSidebarLists;
    this.allocateTaskKeys = allocateTaskKeys;
  }
  // #endregion

  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Runs `FindVisibleList` for the viewer and maps its list and space to the models of the tasks
   * module.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListPlacement | null>} The list and its space, or `null` when the list is
   * unknown or in a space the viewer does not see.
   */
  public async findVisibleList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListPlacement | null> {
    const found: FindVisibleListOutput | null = await this.findVisibleListOperation.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      listId,
    });
    if (found === null) {
      return null;
    }
    const { list, space } = found;
    return {
      list: this.toPlacedList(list),
      space: {
        id: space.id,
        name: space.name,
        prefix: space.prefix,
        description: space.description,
        icon: space.icon,
        color: space.color,
        visibility: space.visibility,
        ownerUserId: space.ownerUserId,
        statuses: {
          triage: { ...space.statuses.triage },
          backlog: { ...space.statuses.backlog },
          todo: { ...space.statuses.todo },
          progress: { ...space.statuses.progress },
          review: { ...space.statuses.review },
          testing: { ...space.statuses.testing },
          waiting: { ...space.statuses.waiting },
          blocked: { ...space.statuses.blocked },
          done: { ...space.statuses.done },
          cancelled: { ...space.statuses.cancelled },
        },
        nextKey: space.nextKey,
        createdAt: space.createdAt,
        version: space.version,
      },
    };
  }

  /**
   * Method visibleSpaceIds
   *
   * @description
   * Runs `ListVisibleSpaceIds` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @returns {Promise<readonly string[]>} The ids of the spaces; empty for a guest.
   */
  public async visibleSpaceIds(organizationId: string, viewer: Viewer): Promise<readonly string[]> {
    const output: ListVisibleSpaceIdsOutput = await this.listVisibleSpaceIds.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
    });
    return output.spaceIds;
  }

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Runs `FindVisibleSpaceLists` for the viewer: every list of the space in the order of creation.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} spaceId - The space.
   * @returns {Promise<readonly PlacedList[] | null>} The lists, or `null` when the space is unknown
   * or not seen by the viewer.
   */
  public async findVisibleSpaceLists(
    organizationId: string,
    viewer: Viewer,
    spaceId: string,
  ): Promise<readonly PlacedList[] | null> {
    const found: FindVisibleSpaceListsOutput | null =
      await this.findVisibleSpaceListsOperation.execute({
        organizationId,
        viewerUserId: viewer.userId,
        viewerRole: viewer.role,
        spaceId,
      });
    return found === null
      ? null
      : found.lists.map((list: VisibleList): PlacedList => this.toPlacedList(list));
  }

  /**
   * Method currentSprints
   *
   * @description
   * Runs `ListCurrentSprints` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} today - The date of the caller, `YYYY-MM-DD`.
   * @param {number} limit - How many sprints at most.
   * @returns {Promise<readonly PlacedList[]>} The sprints; empty for a guest.
   */
  public async currentSprints(
    organizationId: string,
    viewer: Viewer,
    today: string,
    limit: number,
  ): Promise<readonly PlacedList[]> {
    const output: ListCurrentSprintsOutput = await this.listCurrentSprints.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      today,
      limit,
    });
    return output.lists.map((list: VisibleList): PlacedList => this.toPlacedList(list));
  }

  /**
   * Method sidebarLists
   *
   * @description
   * Runs `ListSidebarLists` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<readonly PlacedList[]>} The lists; empty for a guest.
   */
  public async sidebarLists(
    organizationId: string,
    viewer: Viewer,
    limit: number,
  ): Promise<readonly PlacedList[]> {
    const output: ListSidebarListsOutput = await this.listSidebarLists.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      limit,
    });
    return output.lists.map((list: VisibleList): PlacedList => this.toPlacedList(list));
  }

  /**
   * Method allocateKeys
   *
   * @description
   * Runs `AllocateTaskKeys`, which locks the counter row of the prefix until the commit.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} spaceId - The space of the list the tasks are created in.
   * @param {number} count - How many numbers, from 1 to 26.
   * @returns {Promise<KeyAllocation>} The prefix and the first number.
   * @throws {Error} When the space is unknown or the numbers run out (a defect).
   */
  public async allocateKeys(
    organizationId: string,
    spaceId: string,
    count: number,
  ): Promise<KeyAllocation> {
    const output: AllocateTaskKeysOutput = await this.allocateTaskKeys.execute({
      organizationId,
      spaceId,
      count,
    });
    return { prefix: output.prefix, firstNumber: output.firstNumber };
  }

  /**
   * Method toPlacedList
   *
   * @description
   * Copies a list of the spaces module member by member to the model of the tasks module.
   *
   * @param {VisibleList} list - The list as the spaces module answers it.
   * @returns {PlacedList} The list.
   */
  private toPlacedList(list: VisibleList): PlacedList {
    return {
      id: list.id,
      spaceId: list.spaceId,
      name: list.name,
      icon: list.icon,
      color: list.color,
      sprint:
        list.sprint === null
          ? null
          : {
              startDate: list.sprint.startDate,
              endDate: list.sprint.endDate,
              goal: list.sprint.goal,
            },
      createdAt: list.createdAt,
      version: list.version,
    };
  }
  // #endregion
}
