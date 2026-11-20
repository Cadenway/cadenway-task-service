import type {
  AllocateTaskKeys,
  AllocateTaskKeysOutput,
} from '../../../../spaces/public/space/allocate-task-keys.js';
import type { FindTrashList } from '../../../../spaces/public/list/find-trash-list.js';
import type {
  FindVisibleList,
  FindVisibleListOutput,
} from '../../../../spaces/public/list/find-visible-list.js';
import type {
  FindVisibleLists,
  FindVisibleListsOutput,
} from '../../../../spaces/public/list/find-visible-lists.js';
import type {
  FindVisibleSpaceLists,
  FindVisibleSpaceListsOutput,
} from '../../../../spaces/public/list/find-visible-space-lists.js';
import type {
  ListArchivedLists,
  ListArchivedListsOutput,
} from '../../../../spaces/public/list/list-archived-lists.js';
import type { HoldList } from '../../../../spaces/public/list/hold-list.js';
import type { LockDeletedList } from '../../../../spaces/public/list/lock-deleted-list.js';
import type { LockTrashLists } from '../../../../spaces/public/list/lock-trash-lists.js';
import type {
  ListCurrentSprints,
  ListCurrentSprintsOutput,
} from '../../../../spaces/public/list/list-current-sprints.js';
import type {
  ListSidebarLists,
  ListSidebarListsOutput,
  VisibleList,
} from '../../../../spaces/public/list/list-sidebar-lists.js';
import type { ListTrashLists } from '../../../../spaces/public/list/list-trash-lists.js';
import type {
  ListVisibleListIds,
  ListVisibleListIdsOutput,
} from '../../../../spaces/public/list/list-visible-list-ids.js';
import type { PurgeDeletedList } from '../../../../spaces/public/list/purge-deleted-list.js';
import type {
  RestoreArchivedList,
  RestoreArchivedListOutput,
} from '../../../../spaces/public/list/restore-archived-list.js';
import type { RestoreDeletedList } from '../../../../spaces/public/list/restore-deleted-list.js';
import type { ArchivePosition } from '../../../application/models/archive/archive-position.model.js';
import type { ArchivedLists } from '../../../application/models/placement/archived-lists.model.js';
import type { TrashListLock } from '../../../application/models/placement/trash-list-lock.model.js';
import type { DeletedListPurge } from '../../../application/models/placement/deleted-list-purge.model.js';
import type { DeletedListRestoration } from '../../../application/models/placement/deleted-list-restoration.model.js';
import type { HeldList } from '../../../application/models/placement/held-list.model.js';
import type { LockedDeletedList } from '../../../application/models/placement/locked-deleted-list.model.js';
import type { KeyAllocation } from '../../../application/models/placement/key-allocation.model.js';
import type { ListPlacement } from '../../../application/models/placement/list-placement.model.js';
import type { ListRestoration } from '../../../application/models/placement/list-restoration.model.js';
import type { PlacedList } from '../../../application/models/placement/placed-list.model.js';
import type { TrashListAccess } from '../../../application/models/placement/trash-list-access.model.js';
import type { TrashList } from '../../../application/models/placement/trash-list.model.js';
import type { SpaceDirectory } from '../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { Viewer } from '../../../domain/value-objects/member/viewer.value-object.js';

/**
 * Type SpacesTrashListAccessItem
 *
 * @description
 * A list of the trash with the role of the viewer, as `ListTrashLists` of the spaces module answers
 * it.
 *
 * @type {Awaited<ReturnType<ListTrashLists['execute']>>['lists'][number]}
 */
type SpacesTrashListAccessItem = Awaited<ReturnType<ListTrashLists['execute']>>['lists'][number];

/**
 * Type SpacesTrashList
 *
 * @description
 * A list of the trash as the spaces module answers it.
 *
 * @type {SpacesTrashListAccessItem['list']}
 */
type SpacesTrashList = SpacesTrashListAccessItem['list'];

/**
 * Type SpacesTrashListAccess
 *
 * @description
 * What `FindTrashList` of the spaces module answers.
 *
 * @type {Awaited<ReturnType<FindTrashList['execute']>>}
 */
type SpacesTrashListAccess = Awaited<ReturnType<FindTrashList['execute']>>;

/**
 * Type SpacesDeletedListRestoration
 *
 * @description
 * What `RestoreDeletedList` of the spaces module answers.
 *
 * @type {Awaited<ReturnType<RestoreDeletedList['execute']>>}
 */
type SpacesDeletedListRestoration = Awaited<ReturnType<RestoreDeletedList['execute']>>;

/**
 * Type SpacesDeletedListPurge
 *
 * @description
 * What `PurgeDeletedList` of the spaces module answers.
 *
 * @type {Awaited<ReturnType<PurgeDeletedList['execute']>>}
 */
type SpacesDeletedListPurge = Awaited<ReturnType<PurgeDeletedList['execute']>>;

/**
 * Type SpacesHeldList
 *
 * @description
 * What `HoldList` of the spaces module answers.
 *
 * @type {Awaited<ReturnType<HoldList['execute']>>}
 */
type SpacesHeldList = Awaited<ReturnType<HoldList['execute']>>;

/**
 * Type SpacesLockedDeletedList
 *
 * @description
 * What `LockDeletedList` of the spaces module answers.
 *
 * @type {Awaited<ReturnType<LockDeletedList['execute']>>}
 */
type SpacesLockedDeletedList = Awaited<ReturnType<LockDeletedList['execute']>>;

/**
 * Type SpacesTrashListLock
 *
 * @description
 * What `LockTrashLists` of the spaces module answers for one list.
 *
 * @type {Awaited<ReturnType<LockTrashLists['execute']>>['lists'][number]}
 */
type SpacesTrashListLock = Awaited<ReturnType<LockTrashLists['execute']>>['lists'][number];

/**
 * Class SpacesSpaceDirectory
 *
 * @description
 * `SpaceDirectory` over the public operations `FindVisibleList`, `ListVisibleListIds`,
 * `FindVisibleSpaceLists`, `ListCurrentSprints`, `ListSidebarLists`, `AllocateTaskKeys`,
 * `RestoreArchivedList`, `ListArchivedLists` and `FindVisibleLists` of the spaces module, and the
 * seven of the trash (`ListTrashLists`, `FindTrashList`, `RestoreDeletedList`, `PurgeDeletedList`,
 * `HoldList`, `LockDeletedList`, `LockTrashLists`), which join the tenant transaction of the
 * calling use case and
 * decide every role
 * of the viewer. The projections of the spaces module are copied member by member to the models of
 * the tasks module, the roles of the viewer included, so neither module shares a type with the
 * other. The viewer's role in the organization is the one the copy of the memberships gave, passed
 * as `viewerRole`.
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
   * Property listVisibleListIds
   *
   * @description
   * The reading of the lists a viewer has a role on.
   *
   * @type {ListVisibleListIds}
   * @readonly
   */
  private readonly listVisibleListIds: ListVisibleListIds;

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
   * The reading of the current sprints a viewer has a role on.
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

  /**
   * Property restoreArchivedListOperation
   *
   * @description
   * The restoration of the archived list of a restored task.
   *
   * @type {RestoreArchivedList}
   * @readonly
   */
  private readonly restoreArchivedListOperation: RestoreArchivedList;

  /**
   * Property listArchivedLists
   *
   * @description
   * The reading of a page of the archived lists a viewer has a role on.
   *
   * @type {ListArchivedLists}
   * @readonly
   */
  private readonly listArchivedLists: ListArchivedLists;

  /**
   * Property findVisibleListsOperation
   *
   * @description
   * The reading of the lists among some ids a viewer has a role on.
   *
   * @type {FindVisibleLists}
   * @readonly
   */
  private readonly findVisibleListsOperation: FindVisibleLists;

  /**
   * Property listTrashLists
   *
   * @description
   * The reading of the lists whose trash entries a viewer may restore.
   *
   * @type {ListTrashLists}
   * @readonly
   */
  private readonly listTrashLists: ListTrashLists;

  /**
   * Property findTrashListOperation
   *
   * @description
   * The reading of a list, deleted or not, with the role a viewer would have on it.
   *
   * @type {FindTrashList}
   * @readonly
   */
  private readonly findTrashListOperation: FindTrashList;

  /**
   * Property restoreDeletedListOperation
   *
   * @description
   * The restoration of a deleted list and its deleted space with a trash entry.
   *
   * @type {RestoreDeletedList}
   * @readonly
   */
  private readonly restoreDeletedListOperation: RestoreDeletedList;

  /**
   * Property purgeDeletedListOperation
   *
   * @description
   * The erasure of a deleted list left without a task, and of its deleted space with its last list.
   *
   * @type {PurgeDeletedList}
   * @readonly
   */
  private readonly purgeDeletedListOperation: PurgeDeletedList;

  /**
   * Property holdListOperation
   *
   * @description
   * The hold of a list `FOR SHARE` until the commit.
   *
   * @type {HoldList}
   * @readonly
   */
  private readonly holdListOperation: HoldList;

  /**
   * Property lockDeletedListOperation
   *
   * @description
   * The lock of a deleted list `FOR UPDATE` until the commit.
   *
   * @type {LockDeletedList}
   * @readonly
   */
  private readonly lockDeletedListOperation: LockDeletedList;

  /**
   * Property lockTrashListsOperation
   *
   * @description
   * The lock of several deleted lists in one global order, until the commit.
   *
   * @type {LockTrashLists}
   * @readonly
   */
  private readonly lockTrashListsOperation: LockTrashLists;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Takes the sixteen public operations of the spaces module.
   *
   * @param {FindVisibleList} findVisibleList - The reading of a visible list.
   * @param {ListVisibleListIds} listVisibleListIds - The reading of the visible lists.
   * @param {FindVisibleSpaceLists} findVisibleSpaceLists - The reading of the lists of a space.
   * @param {ListCurrentSprints} listCurrentSprints - The reading of the current sprints.
   * @param {ListSidebarLists} listSidebarLists - The reading of the lists of the sidebar.
   * @param {AllocateTaskKeys} allocateTaskKeys - The allocation of task numbers.
   * @param {RestoreArchivedList} restoreArchivedList - The restoration of an archived list.
   * @param {ListArchivedLists} listArchivedLists - The reading of the archived lists.
   * @param {FindVisibleLists} findVisibleLists - The reading of visible lists by id.
   * @param {ListTrashLists} listTrashLists - The reading of the lists of the trash of a viewer.
   * @param {FindTrashList} findTrashList - The reading of a list of the trash.
   * @param {RestoreDeletedList} restoreDeletedList - The restoration of a deleted list.
   * @param {PurgeDeletedList} purgeDeletedList - The erasure of a deleted list.
   * @param {HoldList} holdList - The hold of a list.
   * @param {LockDeletedList} lockDeletedList - The lock of a deleted list.
   * @param {LockTrashLists} lockTrashLists - The lock of several deleted lists.
   * @constructor
   */
  public constructor(
    findVisibleList: FindVisibleList,
    listVisibleListIds: ListVisibleListIds,
    findVisibleSpaceLists: FindVisibleSpaceLists,
    listCurrentSprints: ListCurrentSprints,
    listSidebarLists: ListSidebarLists,
    allocateTaskKeys: AllocateTaskKeys,
    restoreArchivedList: RestoreArchivedList,
    listArchivedLists: ListArchivedLists,
    findVisibleLists: FindVisibleLists,
    listTrashLists: ListTrashLists,
    findTrashList: FindTrashList,
    restoreDeletedList: RestoreDeletedList,
    purgeDeletedList: PurgeDeletedList,
    holdList: HoldList,
    lockDeletedList: LockDeletedList,
    lockTrashLists: LockTrashLists,
  ) {
    this.findVisibleListOperation = findVisibleList;
    this.listVisibleListIds = listVisibleListIds;
    this.findVisibleSpaceListsOperation = findVisibleSpaceLists;
    this.listCurrentSprints = listCurrentSprints;
    this.listSidebarLists = listSidebarLists;
    this.allocateTaskKeys = allocateTaskKeys;
    this.restoreArchivedListOperation = restoreArchivedList;
    this.listArchivedLists = listArchivedLists;
    this.findVisibleListsOperation = findVisibleLists;
    this.listTrashLists = listTrashLists;
    this.findTrashListOperation = findTrashList;
    this.restoreDeletedListOperation = restoreDeletedList;
    this.purgeDeletedListOperation = purgeDeletedList;
    this.holdListOperation = holdList;
    this.lockDeletedListOperation = lockDeletedList;
    this.lockTrashListsOperation = lockTrashLists;
  }
  // #endregion

  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Runs `FindVisibleList` for the viewer and maps its list and space, with the roles of the
   * viewer, to the models of the tasks module.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListPlacement | null>} The list and its space, or `null` when the list is
   * unknown or the viewer has no role on it.
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
        callerRole: space.callerRole,
        callerCanManage: space.callerCanManage,
      },
    };
  }

  /**
   * Method visibleListIds
   *
   * @description
   * Runs `ListVisibleListIds` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {boolean} [editOnly] - Includes only lists the viewer can edit.
   * @returns {Promise<readonly string[]>} The ids of the lists the viewer has a role on.
   */
  public async visibleListIds(
    organizationId: string,
    viewer: Viewer,
    editOnly: boolean = false,
  ): Promise<readonly string[]> {
    const output: ListVisibleListIdsOutput = await this.listVisibleListIds.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      ...(editOnly ? { editOnly } : {}),
    });
    return output.listIds;
  }

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Runs `FindVisibleSpaceLists` for the viewer: the lists of the space the viewer has a role on,
   * in the order of creation.
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
   * @returns {Promise<readonly PlacedList[]>} The sprints the viewer has a role on.
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
   * @returns {Promise<readonly PlacedList[]>} The lists the viewer has a role on.
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
   * Method restoreArchivedList
   *
   * @description
   * Runs `RestoreArchivedList` for the viewer, who is the actor of the restoration: it locks the
   * list, restores it when archived and appends `list.unarchived.v1` in the transaction of the
   * caller.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<ListRestoration>} What the spaces module answered.
   */
  public async restoreArchivedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListRestoration> {
    const output: RestoreArchivedListOutput = await this.restoreArchivedListOperation.execute({
      organizationId,
      actorUserId: viewer.userId,
      viewerRole: viewer.role,
      listId,
    });
    return output.outcome === 'role-insufficient'
      ? { outcome: 'role-insufficient', role: output.role }
      : { outcome: output.outcome };
  }

  /**
   * Method archivedLists
   *
   * @description
   * Runs `ListArchivedLists` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {ArchivePosition | null} after - The last list of the previous page, `null` for the
   * first.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<ArchivedLists>} The lists, each with the role of the viewer, and the total.
   */
  public async archivedLists(
    organizationId: string,
    viewer: Viewer,
    after: ArchivePosition | null,
    limit: number,
  ): Promise<ArchivedLists> {
    const output: ListArchivedListsOutput = await this.listArchivedLists.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      after: after === null ? null : { archivedAt: after.archivedAt, id: after.id },
      limit,
    });
    return {
      lists: output.lists.map((list: VisibleList): PlacedList => this.toPlacedList(list)),
      total: output.total,
    };
  }

  /**
   * Method findVisibleLists
   *
   * @description
   * Runs `FindVisibleLists` for the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {readonly string[]} listIds - The lists, 100 at most.
   * @returns {Promise<readonly PlacedList[]>} The lists found, in no particular order.
   * @throws {Error} With more than 100 ids, from the spaces module.
   */
  public async findVisibleLists(
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
  ): Promise<readonly PlacedList[]> {
    const output: FindVisibleListsOutput = await this.findVisibleListsOperation.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      listIds,
    });
    return output.lists.map((list: VisibleList): PlacedList => this.toPlacedList(list));
  }

  /**
   * Method trashLists
   *
   * @description
   * Runs `ListTrashLists` for the viewer and maps its lists with the role of the viewer.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @returns {Promise<readonly TrashListAccess[]>} The lists the viewer has a role on, as if not
   * deleted, with that role.
   */
  public async trashLists(
    organizationId: string,
    viewer: Viewer,
  ): Promise<readonly TrashListAccess[]> {
    const output: Awaited<ReturnType<ListTrashLists['execute']>> =
      await this.listTrashLists.execute({
        organizationId,
        viewerUserId: viewer.userId,
        viewerRole: viewer.role,
      });
    return output.lists.map((access: SpacesTrashListAccessItem): TrashListAccess => ({
      list: this.toTrashList(access.list),
      role: access.role,
    }));
  }

  /**
   * Method findTrashList
   *
   * @description
   * Runs `FindTrashList` for the viewer and maps its list and the role.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member, with the role of the copy.
   * @param {string} listId - The list.
   * @returns {Promise<TrashListAccess | null>} The list and the role the viewer would have on it, or
   * `null`.
   */
  public async findTrashList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<TrashListAccess | null> {
    const found: SpacesTrashListAccess = await this.findTrashListOperation.execute({
      organizationId,
      viewerUserId: viewer.userId,
      viewerRole: viewer.role,
      listId,
    });
    return found === null ? null : { list: this.toTrashList(found.list), role: found.role };
  }

  /**
   * Method restoreDeletedList
   *
   * @description
   * Runs `RestoreDeletedList` with the viewer as the actor of `space.restored.v1` and
   * `list.restored.v1`, and maps its outcome.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListRestoration>} What came back, or the refusal.
   */
  public async restoreDeletedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<DeletedListRestoration> {
    const output: SpacesDeletedListRestoration = await this.restoreDeletedListOperation.execute({
      organizationId,
      actorUserId: viewer.userId,
      viewerRole: viewer.role,
      listId,
    });
    switch (output.outcome) {
      case 'restored':
        return {
          outcome: 'restored',
          listRestored: output.listRestored,
          spaceRestored: output.spaceRestored,
        };
      case 'role-insufficient':
        return { outcome: 'role-insufficient', role: output.role };
      case 'not-found':
        return { outcome: 'not-found' };
    }
  }

  /**
   * Method purgeDeletedList
   *
   * @description
   * Runs `PurgeDeletedList` and maps its outcome.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListPurge>} What was erased.
   */
  public async purgeDeletedList(organizationId: string, listId: string): Promise<DeletedListPurge> {
    const output: SpacesDeletedListPurge = await this.purgeDeletedListOperation.execute({
      organizationId,
      listId,
    });
    switch (output.outcome) {
      case 'purged':
        return { outcome: 'purged', spacePurged: output.spacePurged };
      case 'not-deleted':
        return { outcome: 'not-deleted' };
      case 'not-found':
        return { outcome: 'not-found' };
    }
  }

  /**
   * Method holdList
   *
   * @description
   * Runs `HoldList` and maps its outcome.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<HeldList>} Whether the list is live, deleted or gone.
   */
  public async holdList(organizationId: string, listId: string): Promise<HeldList> {
    const output: SpacesHeldList = await this.holdListOperation.execute({ organizationId, listId });
    switch (output.outcome) {
      case 'live':
        return { outcome: 'live' };
      case 'deleted':
        return {
          outcome: 'deleted',
          deletedBy: { type: output.deletedBy.type, id: output.deletedBy.id },
        };
      case 'not-found':
        return { outcome: 'not-found' };
    }
  }

  /**
   * Method lockDeletedList
   *
   * @description
   * Runs `LockDeletedList` and maps its outcome.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {string} listId - The list.
   * @returns {Promise<LockedDeletedList>} `deleted` under the lock, `live` or `not-found`.
   */
  public async lockDeletedList(organizationId: string, listId: string): Promise<LockedDeletedList> {
    const output: SpacesLockedDeletedList = await this.lockDeletedListOperation.execute({
      organizationId,
      listId,
    });
    switch (output.outcome) {
      case 'deleted':
        return { outcome: 'deleted' };
      case 'live':
        return { outcome: 'live' };
      case 'not-found':
        return { outcome: 'not-found' };
    }
  }

  /**
   * Method lockTrashLists
   *
   * @description
   * Runs `LockTrashLists` and maps the outcome and the role of each list.
   *
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly string[]} listIds - The lists.
   * @param {'hold' | 'erase'} mode - How the caller holds them.
   * @param {Viewer | null} viewer - The member whose role is read again, `null` for the service.
   * @param {readonly string[]} [additionalSpaceIds] - Other spaces held in the same order.
   * @returns {Promise<readonly TrashListLock[]>} What the lock found for each list.
   */
  public async lockTrashLists(
    organizationId: string,
    listIds: readonly string[],
    mode: 'hold' | 'erase',
    viewer: Viewer | null,
    additionalSpaceIds?: readonly string[],
  ): Promise<readonly TrashListLock[]> {
    const output = await this.lockTrashListsOperation.execute({
      organizationId,
      listIds: [...listIds],
      mode,
      viewer: viewer === null ? null : { userId: viewer.userId, role: viewer.role },
      additionalSpaceIds,
    });
    return output.lists.map((lock: SpacesTrashListLock): TrashListLock => ({
      listId: lock.listId,
      outcome: lock.outcome,
      role: lock.role,
    }));
  }

  /**
   * Method toTrashList
   *
   * @description
   * Copies a list of the trash of the spaces module member by member to the model of the tasks
   * module.
   *
   * @param {SpacesTrashList} list - The list as the spaces module answers it.
   * @returns {TrashList} The list.
   */
  private toTrashList(list: SpacesTrashList): TrashList {
    return { id: list.id, spaceId: list.spaceId, name: list.name, state: list.state };
  }

  /**
   * Method toPlacedList

   *
   * @description
   * Copies a list of the spaces module member by member to the model of the tasks module, with
   * the switch of the organization, its archive, its position in its space (the order of the
   * sidebar and the keyset of the overview) and the role of the viewer.
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
      position: list.position,
      version: list.version,
      organizationAccess: list.organizationAccess,
      archivedAt: list.archivedAt,
      archivedBy:
        list.archivedBy === null ? null : { type: list.archivedBy.type, id: list.archivedBy.id },
      callerRole: list.callerRole,
    };
  }
  // #endregion
}
