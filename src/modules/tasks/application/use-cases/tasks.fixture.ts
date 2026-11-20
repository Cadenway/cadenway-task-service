import { Task } from '../../domain/aggregates/task/task.aggregate.js';
import {
  ALL_STATUSES,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAMILLE,
  CREATED_AT,
  DESIGN,
  HUGO,
  INES,
  LEA,
  MAQUETTES,
  NADIA,
  NOW,
  PRODUIT,
  SPRINT_14,
  TRASHED_AT,
  taskState,
} from '../../domain/tasks.fixture.js';
import type { ActivityEntryDraft } from '../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityKind } from '../../domain/value-objects/activity/activity-kind.value-object.js';
import type { MemberRole } from '../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../domain/value-objects/member/viewer.value-object.js';
import { isLate } from '../../domain/policies/task/lateness.policy.js';
import { showsParent } from '../../domain/policies/subtask/subtask-tree.policy.js';
import type { SubtreeShape } from '../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../domain/value-objects/task/checklist-item-state.value-object.js';
import { labelKey } from '../../domain/value-objects/task/label-name.value-object.js';
import { PRIORITY_KEYS } from '../../domain/value-objects/task/priority-key.value-object.js';
import { isClosedStatus } from '../../domain/value-objects/task/status-category.value-object.js';
import type { StatusKey } from '../../domain/value-objects/task/status-key.value-object.js';
import type { TaskDraft } from '../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskField } from '../../domain/value-objects/task/task-field.value-object.js';
import { TaskKey } from '../../domain/value-objects/task/task-key.value-object.js';
import type { TaskActor } from '../../domain/value-objects/task/task-actor.value-object.js';
import type { TaskState } from '../../domain/value-objects/task/task-state.value-object.js';
import type { TrashHandOver } from '../../domain/value-objects/trash/trash-hand-over.value-object.js';
import type { EventActor } from '../models/actor/event-actor.model.js';
import type { ArchivePosition } from '../models/archive/archive-position.model.js';
import type { ActivityPosition } from '../models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../models/activity/list-activity-filter.model.js';
import type { LabelPosition } from '../models/label/label-position.model.js';
import type { ListedLabel } from '../models/label/listed-label.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { ListedTask } from '../models/query/listed-task.model.js';
import type { MilestonePosition } from '../models/query/milestone-position.model.js';
import { SORT_KEY_PREFIX_LENGTH } from '../models/query/sort-key-prefix-length.model.js';
import type { TaskFilter } from '../models/query/task-filter.model.js';
import type { TaskGrouping } from '../models/query/task-grouping.model.js';
import type { TaskOrder } from '../models/query/task-order.model.js';
import type { TaskPosition } from '../models/query/task-position.model.js';
import type { MyTaskState } from '../models/user/my-task-state.model.js';
import type { ArchivedLists } from '../models/placement/archived-lists.model.js';
import type { KeyAllocation } from '../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../models/placement/list-placement.model.js';
import type { TrashListLock } from '../models/placement/trash-list-lock.model.js';
import type { LockedDeletedList } from '../models/placement/locked-deleted-list.model.js';
import type { ListRestoration } from '../models/placement/list-restoration.model.js';
import type { DeletedListPurge } from '../models/placement/deleted-list-purge.model.js';
import type { DeletedListRestoration } from '../models/placement/deleted-list-restoration.model.js';
import type { HeldList } from '../models/placement/held-list.model.js';
import type { TrashListAccess } from '../models/placement/trash-list-access.model.js';
import type { TrashList } from '../models/placement/trash-list.model.js';
import type { AccessRole } from '../../domain/value-objects/access/access-role.value-object.js';
import type { PlacedList } from '../models/placement/placed-list.model.js';
import type { PlacedSpace } from '../models/placement/placed-space.model.js';
import { TaskRefusal } from '../models/task/task-refusal.model.js';
import type { TaskStanding } from '../models/task/task-standing.model.js';
import type { TaskRefusalReason } from '../models/task/task-refusal-reason.model.js';
import type { ReadOptions } from '../models/transactions/read-options.model.js';
import type { TasksStore } from '../models/transactions/tasks-store.model.js';
import type { TrashCandidateRoot } from '../models/trash/trash-candidate-root.model.js';
import type { TrashEntryDraft } from '../models/trash/trash-entry-draft.model.js';
import type { TrashEntryRecord } from '../models/trash/trash-entry-record.model.js';
import type { TrashPosition } from '../models/trash/trash-position.model.js';
import type { TrashTaskWrite } from '../models/trash/trash-task-write.model.js';
import type { TrashTreeNode } from '../models/trash/trash-tree-node.model.js';
import type { TrashWrites } from '../ports/outbound/feature/trash/trash-writes.port.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { ArchiveReader } from '../ports/outbound/persistence/archive/archive-reader.port.js';
import type { AssignedTaskReader } from '../ports/outbound/persistence/assignee/assigned-task-reader.port.js';
import type { TaskCounter } from '../ports/outbound/persistence/count/task-counter.port.js';
import type { LabelReader } from '../ports/outbound/persistence/label/label-reader.port.js';
import type { TaskQueryReader } from '../ports/outbound/persistence/query/task-query-reader.port.js';
import type { SpaceDirectory } from '../ports/outbound/spaces/space/space-directory.port.js';
import type { TrashEntryRepository } from '../ports/outbound/persistence/trash/trash-entry-repository.port.js';
import type { TasksUnitOfWork } from '../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { ArchivedRootView } from '../projections/archive/archived-root.projection.js';
import type { TaskCountsView } from '../projections/count/task-counts.projection.js';
import type { TaskGroupCountsView } from '../projections/query/task-group-counts.projection.js';
import type { TaskGroupView } from '../projections/query/task-group.projection.js';
import type { HomeStatsView } from '../projections/user/home-stats.projection.js';
import type { MyTaskCountsView } from '../projections/user/my-task-counts.projection.js';
import type { SubtaskCounts } from '../projections/task/subtask-counts.projection.js';
import type { TaskLocation } from '../projections/task/task-location.projection.js';
import type { TaskReferenceInListView } from '../projections/task/task-reference-in-list.projection.js';
import type { TaskSummaryView } from '../projections/task/task-summary.projection.js';

export {
  ALL_STATUSES,
  ARCHIVED_AT,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_482_ENTRY,
  CAD_490,
  CAMILLE,
  CAMILLE_ACTOR,
  CREATED_AT,
  DESIGN,
  HUGO,
  HUGO_ACTOR,
  INES,
  INES_ACTOR,
  LEA,
  MAQUETTES,
  MAQUETTE_VALIDEE,
  NADIA,
  NOW,
  PRODUIT,
  RECETTE,
  SPRINT_14,
  STRANGER,
  TRASHED_AT,
  UPDATED_AT,
  archiveFrom,
  cad490State,
  priorityEntry,
  statusesHiding,
  subtaskState,
  taskState,
  trashIn,
} from '../../domain/tasks.fixture.js';

/** Another organization than Atelier Nord. */
export const OTHER_ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/** A list id no list has. */
export const UNKNOWN_LIST = '019a7100-0000-7000-8000-0000000000ff';

/** The space "Archives" (ARC), which no longer uses the status `testing`. */
export const ARCHIVES = '019a7000-0000-7000-8000-000000000003';

/** The list "Clôturés" of the space "Archives". */
export const CLOTURES = '019a7100-0000-7000-8000-000000000005';

/** An event the use cases appended to the outbox, as plain data. */
export type RecordedEvent =
  | {
      readonly kind: 'created';
      readonly key: string;
      readonly version: number;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'dependencyChanged';
      readonly action: 'added' | 'removed';
      readonly dependencyId: string;
      readonly key: string;
      readonly version: number;
      readonly blockedKey: string;
      readonly blockedVersion: number;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'milestoneReached';
      readonly key: string;
      readonly version: number;
      readonly watcherIds: readonly string[];
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'occurrenceCreated';
      readonly key: string;
      readonly version: number;
      readonly successorKey: string;
      readonly cadence: string;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'updated';
      readonly key: string;
      readonly version: number;
      readonly changed: readonly TaskField[];
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'statusChanged';
      readonly key: string;
      readonly version: number;
      readonly previousStatus: StatusKey;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'assigned';
      readonly key: string;
      readonly version: number;
      readonly assigneeId: string;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'archived' | 'unarchived';
      readonly key: string;
      readonly version: number;
      readonly rootKey: string;
      readonly parentKey: string | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'trashed' | 'restored' | 'purged';
      readonly key: string;
      readonly version: number;
      readonly entryId: string;
      readonly rootKey: string;
      readonly parentKey: string | null;
      readonly purgeAt: Date | null;
      readonly actor: EventActor;
    };

/** A job the use cases enqueued in the transaction, as plain data. */
export type RecordedJob =
  | {
      readonly queue: 'task.drop-trashed-task-requests';
      readonly entryId: string;
      readonly taskIds: readonly string[];
    }
  | { readonly queue: 'task.purge-trash' };

/**
 * A trash entry as the fake stores it, the row of `trash_entries`: the root it reads with comes
 * from the tasks, as the statements join it.
 */
export interface StoredTrashEntry extends TrashEntryDraft {
  // #region Properties
  /** Id of the entry. */
  readonly id: string;

  /** The hand-over to the purge, `null` while in the trash. */
  readonly purgeRequest: TrashHandOver | null;
  // #endregion
}

/** The switch of the writes of the trash, on: "Supprimer la tâche" and "Vider la corbeille" serve. */
export const TRASH_WRITES_ON: TrashWrites = { isEnabled: (): boolean => true };

/** The switch of the writes of the trash, off: they answer as a route the service does not have. */
export const TRASH_WRITES_OFF: TrashWrites = { isEnabled: (): boolean => false };

/**
 * Whether a task is live, the condition of `liveTask`: in no archive and not in the trash.
 *
 * @param state - The task.
 * @returns Whether it is live.
 */
export function isLiveState(state: TaskState): boolean {
  return state.archive === null && state.trash === null;
}

/**
 * Builds a stored trash entry of the specs: CAD-482 and its two subtasks, deleted from Sprint 14
 * by Camille Martin on 2026-11-06, still in the trash.
 *
 * @param overrides - Fields to replace.
 * @returns The entry.
 */
export function storedEntry(overrides: Partial<StoredTrashEntry> = {}): StoredTrashEntry {
  return {
    id: CAD_482_ENTRY,
    organizationId: ATELIER_NORD,
    rootTaskId: CAD_482,
    listId: SPRINT_14,
    parentKey: null,
    taskCount: 3,
    trashedAt: TRASHED_AT,
    trashedBy: { type: 'user', id: CAMILLE },
    purgeRequest: null,
    ...overrides,
  };
}

/**
 * Builds the space "Produit" (CAD) as the spaces module answers it: seen by the whole
 * organization, owned by Camille Martin, every status used.
 *
 * @param overrides - Fields to replace.
 * @returns The space.
 */
export function placedSpace(overrides: Partial<PlacedSpace> = {}): PlacedSpace {
  return {
    id: PRODUIT,
    name: 'Produit',
    prefix: 'CAD',
    description: null,
    icon: 'rocket',
    color: 'violet',
    visibility: 'organization',
    ownerUserId: CAMILLE,
    statuses: Object.fromEntries(
      Object.entries(ALL_STATUSES).map(([key]: [string, unknown]) => [
        key,
        { name: null, hidden: false },
      ]),
    ) as PlacedSpace['statuses'],
    nextKey: 'CAD-496',
    createdAt: new Date('2026-10-01T09:00:00Z'),
    version: 1,
    callerRole: 'edit',
    callerCanManage: true,
    ...overrides,
  };
}

/**
 * Builds the list "Sprint 14" of the space "Produit", placed in its space by its creation (never
 * restored) unless the overrides give it a position.
 *
 * @param overrides - Fields to replace.
 * @returns The list.
 */
export function placedList(overrides: Partial<PlacedList> = {}): PlacedList {
  const createdAt: Date = overrides.createdAt ?? new Date('2026-10-26T09:00:00Z');
  return {
    id: SPRINT_14,
    spaceId: PRODUIT,
    name: 'Sprint 14',
    icon: null,
    color: 'bleu',
    sprint: { startDate: '2026-11-02', endDate: '2026-11-15', goal: 'Livrer le SSO' },
    createdAt,
    position: createdAt,
    version: 1,
    organizationAccess: true,
    archivedAt: null,
    archivedBy: null,
    callerRole: 'edit',
    ...overrides,
  };
}

/** The rank of each role, `edit` > `comment` > `view`. */
const ROLE_RANK: Readonly<Record<AccessRole, number>> = { view: 1, comment: 2, edit: 3 };

/**
 * Picks the highest of some roles.
 *
 * @param roles - The roles, `undefined` or `null` for none.
 * @returns The highest, `null` when there is none.
 */
function highestRole(roles: readonly (AccessRole | null | undefined)[]): AccessRole | null {
  let highest: AccessRole | null = null;
  for (const role of roles) {
    if (
      role !== null &&
      role !== undefined &&
      (highest === null || ROLE_RANK[role] > ROLE_RANK[highest])
    ) {
      highest = role;
    }
  }
  return highest;
}

/**
 * Builds the task CAD-(800 + index) in Sprint 14, for the specs of the queries: top-level, `todo`,
 * `moyenne`, unassigned, without label, due date or checklist, created `index` minutes after
 * CAD-482.
 *
 * @param index - Which task; it gives the key, the id, the name and the creation instant.
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function queryTask(index: number, overrides: Partial<TaskState> = {}): TaskState {
  return taskState({
    id: `019a7200-0000-7000-8000-000000000${String(800 + index)}`,
    key: TaskKey.of('CAD', 800 + index),
    name: `Tâche ${String(index)}`,
    description: null,
    status: 'todo',
    priority: 'moyenne',
    assigneeIds: [],
    labels: [],
    dueDate: null,
    startDate: null,
    estimateMinutes: null,
    checklist: [],
    createdAt: new Date(CREATED_AT.getTime() + index * 60_000),
    version: 1,
    ...overrides,
  });
}

/**
 * Compares two texts by code unit, as the database compares them with the collation "C".
 *
 * @param left - The first text.
 * @param right - The second text.
 * @returns A negative number, 0 or a positive number.
 */
export function compareText(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/**
 * Compares two rows in the order of their creation, the id breaking the ties.
 *
 * @param left - The first row.
 * @param right - The second row.
 * @returns A negative number, 0 or a positive number.
 */
export function byCreation(
  left: { readonly createdAt: Date; readonly id: string },
  right: { readonly createdAt: Date; readonly id: string },
): number {
  return left.createdAt.getTime() - right.createdAt.getTime() || compareText(left.id, right.id);
}

/**
 * Builds the usual lists of Atelier Nord: "Sprint 14" and "Bugs" in "Produit", "Maquettes" in the
 * private space "Design" of Hugo Dubois, "Clôturés" in "Archives", every switch on.
 *
 * @param overrides - Fields to replace in "Sprint 14".
 * @returns The lists.
 */
export function atelierNordLists(overrides: Partial<PlacedList> = {}): readonly PlacedList[] {
  return [
    placedList(overrides),
    placedList({ id: BUGS, name: 'Bugs', sprint: null }),
    placedList({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes', sprint: null }),
    placedList({ id: CLOTURES, spaceId: ARCHIVES, name: 'Clôturés', sprint: null }),
  ];
}

/** What a spec seeds in the fake spaces. */
export interface InMemorySpaceSeed {
  // #region Properties
  /** The spaces; the usual ones (Produit, Design, Archives) when left out. */
  readonly spaces?: readonly PlacedSpace[];

  /** The lists; the usual ones (Sprint 14, Bugs, Maquettes, Clôturés) when left out. */
  readonly lists?: readonly PlacedList[];

  /** The grants of the spaces: the role of each account, by space id; none when left out. */
  readonly spaceGrants?: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The grants of the lists: the role of each account, by list id; none when left out. */
  readonly listGrants?: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The last number given for each prefix. */
  readonly lastNumbers?: Readonly<Record<string, number>>;

  /** The calls of every fake, in order, shared with the other fakes. */
  readonly trace?: string[];

  /** The instant a restoration of a list takes; `NOW` when left out. */
  readonly now?: Date;

  /**
   * The deleted lists (tombstones), with who deleted each, by list id; none when left out. A list
   * deleted with its space is listed too, as the spaces module marks it.
   */
  readonly deletedLists?: Readonly<Record<string, TaskActor>>;

  /** The deleted spaces (tombstones), with who deleted each, by space id; none when left out. */
  readonly deletedSpaces?: Readonly<Record<string, TaskActor>>;
  // #endregion
}

/** How many lists `findVisibleLists` accepts, as the spaces module does. */
const MAX_VISIBLE_LISTS: number = 100;

/**
 * Class InMemorySpaceDirectory
 *
 * @description
 * A fake `SpaceDirectory` over spaces and lists of Atelier Nord, with the access rules of the
 * spaces module ("Access" of `openapi/public/spaces.yaml`): the role on a list is the highest of
 * `edit` for the owner of the space, `edit` for a list of a space of the organization whose switch
 * is on, the grant of the space and the grant of the list; a guest has the grant of the list only.
 * A space is seen with a role on it (the owner, a space of the organization, a grant of the space;
 * never by a guest) or through a grant of one of its lists. With no grant seeded, every member
 * other than a guest has `edit` on every list of a space of the organization and the owner on
 * those of their private space: the rules before grants. As the spaces module, it leaves archived
 * lists out of the lists of a space, the current sprints and the sidebar, keeps them in
 * `findVisibleList`, `visibleListIds` and `findVisibleLists`, and orders the lists of a space by
 * their position (`(coalesce(restored_at, created_at), id)`): a restoration of a list
 * (`restoreArchivedList`) moves it to the end of its space. It changes the fake at once and does
 * not roll back with a unit of work, like the key counter. A deleted list or space (a tombstone)
 * is invisible to every method but the five of the trash, which compute the role as if neither
 * were deleted (`trashLists`, `findTrashList`, `restoreDeletedList`), erase a tombstone left
 * without a task (`purgeDeletedList`) and hold a list (`holdList`), as the spaces module does.
 */
export class InMemorySpaceDirectory implements SpaceDirectory {
  // #region Properties
  /** The `allocateKeys` calls. */
  public readonly allocateCalls: {
    readonly organizationId: string;
    readonly spaceId: string;
    readonly count: number;
  }[] = [];

  /** The `findVisibleList` calls, as list ids. */
  public readonly findCalls: string[] = [];

  /** The `findVisibleSpaceLists` calls, as space ids. */
  public readonly spaceListCalls: string[] = [];

  /** The `currentSprints` calls. */
  public readonly sprintCalls: { readonly today: string; readonly limit: number }[] = [];

  /** The `sidebarLists` calls. */
  public readonly sidebarCalls: { readonly limit: number }[] = [];

  /** The last number given for each prefix. */
  public readonly lastNumbers: Map<string, number>;

  /** The spaces by id. */
  private readonly spaces: ReadonlyMap<string, PlacedSpace>;

  /** The `restoreArchivedList` calls, as list ids, the lists restored included. */
  public readonly restoreCalls: string[] = [];

  /** The lists by id; a restoration replaces its list, at the position of its restoration. */
  private readonly lists: Map<string, PlacedList>;

  /** The instant a restoration takes. */
  private readonly now: Date;

  /** The grants of the spaces, by space id then account. */
  private readonly spaceGrants: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The grants of the lists, by list id then account. */
  private readonly listGrants: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The calls of every fake, in order. */
  private readonly trace: string[];

  /** The `holdList` calls, as list ids. */
  public readonly holdCalls: string[] = [];

  /** The `lockDeletedList` calls, as list ids. */
  public readonly lockDeletedCalls: string[] = [];

  /** The `lockTrashLists` calls: the lists given, the mode and the viewer. */
  public readonly lockTrashCalls: {
    readonly listIds: readonly string[];
    readonly mode: 'hold' | 'erase';
    readonly viewer: Viewer | null;
  }[] = [];

  /**
   * The lists on which no viewer has a role any more once `lockTrashLists` holds them: a grant
   * revoked, or their space made private, while the lock waited. The other readings ignore it.
   */
  public readonly revokedUnderLock: Set<string> = new Set<string>();

  /** The `purgeDeletedList` calls, as list ids. */
  public readonly purgeCalls: string[] = [];

  /** The `restoreDeletedList` calls, as list ids. */
  public readonly restoreDeletedCalls: string[] = [];

  /** The deleted lists, with who deleted each. */
  private readonly deletedLists: Map<string, TaskActor>;

  /** The deleted spaces, with who deleted each. */
  private readonly deletedSpaces: Map<string, TaskActor>;

  /** The spaces by id, erased ones removed. */
  private readonly liveSpaces: Map<string, PlacedSpace>;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the spaces of one organization.
   *
   * @param {InMemorySpaceSeed} seed - What is stored.
   * @constructor
   */
  public constructor(seed: InMemorySpaceSeed = {}) {
    const spaces: readonly PlacedSpace[] = seed.spaces ?? [
      placedSpace(),
      placedSpace({
        id: DESIGN,
        name: 'Design',
        prefix: 'DES',
        visibility: 'private',
        ownerUserId: HUGO,
        nextKey: 'DES-1',
      }),
      placedSpace({
        id: ARCHIVES,
        name: 'Archives',
        prefix: 'ARC',
        nextKey: 'ARC-1',
        statuses: {
          ...placedSpace().statuses,
          testing: { name: null, hidden: true },
        },
      }),
    ];
    const lists: readonly PlacedList[] = seed.lists ?? atelierNordLists();
    this.spaces = new Map(
      spaces.map((space: PlacedSpace): [string, PlacedSpace] => [space.id, space]),
    );
    this.lists = new Map(lists.map((list: PlacedList): [string, PlacedList] => [list.id, list]));
    this.spaceGrants = seed.spaceGrants ?? {};
    this.listGrants = seed.listGrants ?? {};
    this.lastNumbers = new Map(Object.entries(seed.lastNumbers ?? { CAD: 495 }));
    this.trace = seed.trace ?? [];
    this.now = seed.now ?? NOW;
    this.deletedLists = new Map(Object.entries(seed.deletedLists ?? {}));
    this.deletedSpaces = new Map(Object.entries(seed.deletedSpaces ?? {}));
    this.liveSpaces = new Map(this.spaces);
  }
  // #endregion

  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Finds a list of Atelier Nord the viewer has a role on, with that role, and its space, with the
   * role of the viewer on it and whether they manage it.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<ListPlacement | null>} The list and its space, or `null`.
   */
  public findVisibleList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListPlacement | null> {
    this.trace.push('spaces.findVisibleList');
    this.findCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    const space: PlacedSpace | undefined =
      list === undefined ? undefined : this.spaces.get(list.spaceId);
    if (organizationId !== ATELIER_NORD || list === undefined || space === undefined) {
      return Promise.resolve(null);
    }
    const placed: PlacedList | null = this.placed(viewer, list);
    if (placed === null) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      list: placed,
      space: {
        ...space,
        callerRole: this.spaceRoleOf(viewer, space),
        callerCanManage: this.manages(viewer, space),
      },
    });
  }

  /**
   * Method visibleListIds
   *
   * @description
   * Lists the lists the viewer has a role on, in the order of the sidebar.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @returns {Promise<readonly string[]>} Their ids.
   */
  public visibleListIds(
    organizationId: string,
    viewer: Viewer,
    editOnly: boolean = false,
  ): Promise<readonly string[]> {
    this.trace.push('spaces.visibleListIds');
    return Promise.resolve(
      this.visibleLists(organizationId, viewer)
        .filter((list: PlacedList): boolean => !editOnly || list.callerRole === 'edit')
        .map((list: PlacedList): string => list.id),
    );
  }

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Lists the live lists of a space of Atelier Nord the viewer sees that they have a role on, with
   * that role, in the order of the sidebar (position, then id).
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} spaceId - The space.
   * @returns {Promise<readonly PlacedList[] | null>} The lists, or `null`.
   */
  public findVisibleSpaceLists(
    organizationId: string,
    viewer: Viewer,
    spaceId: string,
  ): Promise<readonly PlacedList[] | null> {
    this.trace.push('spaces.findVisibleSpaceLists');
    this.spaceListCalls.push(spaceId);
    const space: PlacedSpace | undefined = this.spaces.get(spaceId);
    if (
      organizationId !== ATELIER_NORD ||
      space === undefined ||
      this.deletedSpaces.has(spaceId) ||
      !this.seesSpace(viewer, space)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve(
      this.placedListsOf(viewer, space).filter(
        (list: PlacedList): boolean => list.archivedAt === null,
      ),
    );
  }

  /**
   * Method currentSprints
   *
   * @description
   * Lists the sprints the viewer has a role on that are current on a date, by end date then
   * creation.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} today - The date of the caller.
   * @param {number} limit - How many sprints at most.
   * @returns {Promise<readonly PlacedList[]>} The sprints.
   */
  public currentSprints(
    organizationId: string,
    viewer: Viewer,
    today: string,
    limit: number,
  ): Promise<readonly PlacedList[]> {
    this.trace.push('spaces.currentSprints');
    this.sprintCalls.push({ today, limit });
    return Promise.resolve(
      this.visibleLists(organizationId, viewer)
        .filter(
          (list: PlacedList): boolean =>
            list.archivedAt === null &&
            list.sprint !== null &&
            list.sprint.startDate <= today &&
            today <= list.sprint.endDate,
        )
        .sort(
          (left: PlacedList, right: PlacedList): number =>
            compareText(left.sprint?.endDate ?? '', right.sprint?.endDate ?? '') ||
            byCreation(left, right),
        )
        .slice(0, limit),
    );
  }

  /**
   * Method sidebarLists
   *
   * @description
   * Lists the first lists the viewer has a role on: the spaces, then their lists, each in the
   * order of their creation.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<readonly PlacedList[]>} The lists.
   */
  public sidebarLists(
    organizationId: string,
    viewer: Viewer,
    limit: number,
  ): Promise<readonly PlacedList[]> {
    this.trace.push('spaces.sidebarLists');
    this.sidebarCalls.push({ limit });
    return Promise.resolve(
      this.visibleLists(organizationId, viewer)
        .filter((list: PlacedList): boolean => list.archivedAt === null)
        .slice(0, limit),
    );
  }

  /**
   * Method allocateKeys
   *
   * @description
   * Gives the next numbers of the prefix of the space; the counter does not roll back with a
   * unit of work in this fake.
   *
   * @param {string} organizationId - The organization.
   * @param {string} spaceId - The space.
   * @param {number} count - How many numbers.
   * @returns {Promise<KeyAllocation>} The prefix and the first number.
   * @throws {Error} When the space is unknown.
   */
  public allocateKeys(
    organizationId: string,
    spaceId: string,
    count: number,
  ): Promise<KeyAllocation> {
    this.trace.push('spaces.allocateKeys');
    this.allocateCalls.push({ organizationId, spaceId, count });
    const space: PlacedSpace | undefined = this.spaces.get(spaceId);
    if (space === undefined) {
      return Promise.reject(new Error('The space is unknown.'));
    }
    const last: number = this.lastNumbers.get(space.prefix) ?? 0;
    this.lastNumbers.set(space.prefix, last + count);
    return Promise.resolve({ prefix: space.prefix, firstNumber: last + 1 });
  }

  /**
   * Method restoreArchivedList
   *
   * @description
   * Restores an archived list the viewer has `edit` on, as the spaces module does: `not-found`
   * without a role, `role-insufficient` without `edit`, `not-archived` for a live list; a
   * restored list takes the next version and goes to the end of its space, and the trace records
   * `spaces.listUnarchived`, the event the spaces module appends. A live list is still looked up
   * (the spaces module locks it) and answers `not-archived`.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<ListRestoration>} What the spaces module answers.
   */
  public restoreArchivedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<ListRestoration> {
    this.trace.push('spaces.restoreArchivedList');
    this.restoreCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    const placed: PlacedList | null =
      organizationId !== ATELIER_NORD || list === undefined ? null : this.placed(viewer, list);
    if (list === undefined || placed === null) {
      return Promise.resolve({ outcome: 'not-found' });
    }
    if (placed.callerRole !== 'edit') {
      return Promise.resolve({ outcome: 'role-insufficient', role: placed.callerRole });
    }
    if (list.archivedAt === null) {
      return Promise.resolve({ outcome: 'not-archived' });
    }
    this.lists.set(listId, {
      ...list,
      archivedAt: null,
      archivedBy: null,
      version: list.version + 1,
      position: this.now,
    });
    this.trace.push('spaces.listUnarchived');
    return Promise.resolve({ outcome: 'restored' });
  }

  /**
   * Method archivedLists
   *
   * @description
   * Lists the archived lists the viewer has a role on, the most recently archived first, after a
   * position, at most `limit`, and their number.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {ArchivePosition | null} after - The last list of the previous page.
   * @param {number} limit - How many lists at most.
   * @returns {Promise<ArchivedLists>} The lists and the total.
   */
  public archivedLists(
    organizationId: string,
    viewer: Viewer,
    after: ArchivePosition | null,
    limit: number,
  ): Promise<ArchivedLists> {
    this.trace.push('spaces.archivedLists');
    const archived: PlacedList[] = this.visibleLists(organizationId, viewer)
      .filter((list: PlacedList): boolean => list.archivedAt !== null)
      .sort(
        (left: PlacedList, right: PlacedList): number =>
          (right.archivedAt?.getTime() ?? 0) - (left.archivedAt?.getTime() ?? 0) ||
          compareText(right.id, left.id),
      );
    const start: number =
      after === null
        ? 0
        : archived.findIndex(
            (list: PlacedList): boolean =>
              (list.archivedAt?.getTime() ?? 0) < after.archivedAt.getTime() ||
              ((list.archivedAt?.getTime() ?? 0) === after.archivedAt.getTime() &&
                compareText(list.id, after.id) < 0),
          );
    return Promise.resolve({
      lists: start === -1 ? [] : archived.slice(start, start + limit),
      total: archived.length,
    });
  }

  /**
   * Method findVisibleLists
   *
   * @description
   * Finds the lists among some ids the viewer has a role on, archived ones included.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {readonly string[]} listIds - The lists, 100 at most.
   * @returns {Promise<readonly PlacedList[]>} The lists found.
   * @throws {Error} With more than 100 ids.
   */
  public findVisibleLists(
    organizationId: string,
    viewer: Viewer,
    listIds: readonly string[],
  ): Promise<readonly PlacedList[]> {
    this.trace.push('spaces.findVisibleLists');
    if (listIds.length > MAX_VISIBLE_LISTS) {
      return Promise.reject(new Error('At most 100 lists are found at once.'));
    }
    return Promise.resolve(
      this.visibleLists(organizationId, viewer).filter((list: PlacedList): boolean =>
        listIds.includes(list.id),
      ),
    );
  }

  /**
   * Method trashLists
   *
   * @description
   * Lists every list of Atelier Nord, live, archived or deleted (erased ones are gone), on which
   * the viewer has a role as if neither the list nor its space were deleted, with its state and
   * that role, as `ListTrashLists` answers (the module keeps those with `edit`).
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @returns {Promise<readonly TrashListAccess[]>} The lists with the role of the viewer.
   */
  public trashLists(organizationId: string, viewer: Viewer): Promise<readonly TrashListAccess[]> {
    this.trace.push('spaces.trashLists');
    if (organizationId !== ATELIER_NORD) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      [...this.lists.values()].flatMap((list: PlacedList): TrashListAccess[] => {
        const access: TrashListAccess | null = this.trashAccessOf(viewer, list);
        return access === null ? [] : [access];
      }),
    );
  }

  /**
   * Method findTrashList
   *
   * @description
   * Finds a list, deleted or not, with the role the viewer would have on it as if not deleted.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<TrashListAccess | null>} The list and the role, or `null`.
   */
  public findTrashList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<TrashListAccess | null> {
    this.trace.push('spaces.findTrashList');
    const list: PlacedList | undefined = this.lists.get(listId);
    return Promise.resolve(
      organizationId !== ATELIER_NORD || list === undefined
        ? null
        : this.trashAccessOf(viewer, list),
    );
  }

  /**
   * Method restoreDeletedList
   *
   * @description
   * Restores the list of a trash entry as the spaces module does: `not-found` without a role as if
   * not deleted, `role-insufficient` without `edit`; else brings back its deleted space (the trace
   * records `spaces.spaceRestored`) then the list (`spaces.listRestored`, the next version, the end
   * of its space), or answers `restored` with both flags false for a live list and space.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListRestoration>} What came back, or the refusal.
   */
  public restoreDeletedList(
    organizationId: string,
    viewer: Viewer,
    listId: string,
  ): Promise<DeletedListRestoration> {
    this.trace.push('spaces.restoreDeletedList');
    this.restoreDeletedCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    const access: TrashListAccess | null =
      organizationId !== ATELIER_NORD || list === undefined
        ? null
        : this.trashAccessOf(viewer, list);
    if (list === undefined || access === null) {
      return Promise.resolve({ outcome: 'not-found' });
    }
    if (access.role !== 'edit') {
      return Promise.resolve({ outcome: 'role-insufficient', role: access.role });
    }
    const spaceRestored: boolean = this.deletedSpaces.delete(list.spaceId);
    if (spaceRestored) {
      this.trace.push('spaces.spaceRestored');
    }
    const listRestored: boolean = this.deletedLists.delete(listId);
    if (listRestored) {
      this.lists.set(listId, { ...list, version: list.version + 1, position: this.now });
      this.trace.push('spaces.listRestored');
    }
    return Promise.resolve({ outcome: 'restored', listRestored, spaceRestored });
  }

  /**
   * Method purgeDeletedList
   *
   * @description
   * Erases a deleted list, then its deleted space once no list of it is left, as the spaces module
   * does; a live list answers `not-deleted`, an unknown or erased one `not-found`.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @returns {Promise<DeletedListPurge>} What was erased.
   */
  public purgeDeletedList(organizationId: string, listId: string): Promise<DeletedListPurge> {
    this.trace.push('spaces.purgeDeletedList');
    this.purgeCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    if (organizationId !== ATELIER_NORD || list === undefined) {
      return Promise.resolve({ outcome: 'not-found' });
    }
    if (!this.deletedLists.has(listId)) {
      return Promise.resolve({ outcome: 'not-deleted' });
    }
    this.lists.delete(listId);
    this.deletedLists.delete(listId);
    const spacePurged: boolean =
      this.deletedSpaces.has(list.spaceId) &&
      ![...this.lists.values()].some(
        (other: PlacedList): boolean => other.spaceId === list.spaceId,
      );
    if (spacePurged) {
      this.deletedSpaces.delete(list.spaceId);
      this.liveSpaces.delete(list.spaceId);
    }
    return Promise.resolve({ outcome: 'purged', spacePurged });
  }

  /**
   * Method lockTrashLists
   *
   * @description
   * Locks the lists of trash entries as the spaces module does, live or deleted, in one call: for
   * each distinct list, in the order first given, `deleted` when the list or its space is deleted,
   * `live` or `not-found` otherwise, with the role of the viewer as `findTrashList` computes it
   * (`null` without a viewer, for a list not found, or for a list of `revokedUnderLock`).
   *
   * @param {string} organizationId - The organization.
   * @param {readonly string[]} listIds - The lists.
   * @param {'hold' | 'erase'} mode - How the caller holds them.
   * @param {Viewer | null} viewer - The member whose role is read, `null` for the service.
   * @returns {Promise<readonly TrashListLock[]>} What the lock found for each list.
   */
  public lockTrashLists(
    organizationId: string,
    listIds: readonly string[],
    mode: 'hold' | 'erase',
    viewer: Viewer | null,
  ): Promise<readonly TrashListLock[]> {
    this.trace.push('spaces.lockTrashLists');
    this.lockTrashCalls.push({ listIds: [...listIds], mode, viewer });
    return Promise.resolve(
      [...new Set(listIds)].map((listId: string): TrashListLock => {
        const list: PlacedList | undefined = this.lists.get(listId);
        if (organizationId !== ATELIER_NORD || list === undefined) {
          return { listId, outcome: 'not-found', role: null };
        }
        const deleted: boolean =
          this.deletedLists.has(listId) || this.deletedSpaces.has(list.spaceId);
        const role: AccessRole | null =
          viewer === null || this.revokedUnderLock.has(listId)
            ? null
            : (this.trashAccessOf(viewer, list)?.role ?? null);
        return { listId, outcome: deleted ? 'deleted' : 'live', role };
      }),
    );
  }

  /**
   * Method lockDeletedList
   *
   * @description
   * Locks a deleted list as the spaces module does: `deleted` when the list or its space is
   * deleted (its space, then the list `FOR UPDATE`), `live` for a live list and `not-found` for an
   * unknown or erased list, neither of them locked.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @returns {Promise<LockedDeletedList>} Whether the list is deleted under its lock, live or gone.
   */
  public lockDeletedList(organizationId: string, listId: string): Promise<LockedDeletedList> {
    this.trace.push('spaces.lockDeletedList');
    this.lockDeletedCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    if (organizationId !== ATELIER_NORD || list === undefined) {
      return Promise.resolve({ outcome: 'not-found' });
    }
    const deleted: boolean = this.deletedLists.has(listId) || this.deletedSpaces.has(list.spaceId);
    return Promise.resolve(deleted ? { outcome: 'deleted' } : { outcome: 'live' });
  }

  /**
   * Method holdList
   *
   * @description
   * Holds a list as the spaces module does: `deleted` when the list or its space is deleted, with
   * who deleted the list (else the space), `not-found` for an unknown or erased list.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @returns {Promise<HeldList>} Whether the list is live, deleted or gone.
   */
  public holdList(organizationId: string, listId: string): Promise<HeldList> {
    this.trace.push('spaces.holdList');
    this.holdCalls.push(listId);
    const list: PlacedList | undefined = this.lists.get(listId);
    if (organizationId !== ATELIER_NORD || list === undefined) {
      return Promise.resolve({ outcome: 'not-found' });
    }
    const deletedBy: TaskActor | undefined =
      this.deletedLists.get(listId) ?? this.deletedSpaces.get(list.spaceId);
    return Promise.resolve(
      deletedBy === undefined ? { outcome: 'live' } : { outcome: 'deleted', deletedBy },
    );
  }

  /**
   * Method isStored
   *
   * @description
   * Whether the fake still holds a list (not erased), for the assertions of a spec.
   *
   * @param {string} listId - The list.
   * @returns {boolean} Whether it is stored.
   */
  public isStored(listId: string): boolean {
    return this.lists.has(listId);
  }

  /**
   * Method isDeleted
   *
   * @description
   * Whether a list or its space is a tombstone, for the assertions of a spec.
   *
   * @param {string} listId - The list.
   * @returns {boolean} Whether it is deleted.
   */
  public isDeleted(listId: string): boolean {
    const list: PlacedList | undefined = this.lists.get(listId);
    return (
      this.deletedLists.has(listId) || (list !== undefined && this.deletedSpaces.has(list.spaceId))
    );
  }

  /**
   * Method hasSpace
   *
   * @description
   * Whether the fake still holds a space (not erased), for the assertions of a spec.
   *
   * @param {string} spaceId - The space.
   * @returns {boolean} Whether it is stored.
   */
  public hasSpace(spaceId: string): boolean {
    return this.liveSpaces.has(spaceId);
  }

  /**
   * Method stateOf
   *
   * @description
   * Reads a list as the fake holds it now, for the assertions of a spec.
   *
   * @param {string} listId - The list.
   * @returns {PlacedList} The list.
   * @throws {Error} When the fake holds no such list.
   */
  public stateOf(listId: string): PlacedList {
    const list: PlacedList | undefined = this.lists.get(listId);
    if (list === undefined) {
      throw new Error('The list is not stored.');
    }
    return list;
  }

  /**
   * Method visibleLists
   *
   * @description
   * Lists the lists the viewer has a role on in the order of the sidebar: the spaces by creation,
   * then the lists of each by creation, each with the role of the viewer.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @returns {PlacedList[]} The lists.
   */
  private visibleLists(organizationId: string, viewer: Viewer): PlacedList[] {
    if (organizationId !== ATELIER_NORD) {
      return [];
    }
    return [...this.spaces.values()]
      .sort(byCreation)
      .flatMap((space: PlacedSpace): PlacedList[] => this.placedListsOf(viewer, space));
  }

  /**
   * Method placedListsOf
   *
   * @description
   * Lists the lists of a space the viewer has a role on, by position (restoration, else creation)
   * then id, each with that role.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {PlacedList[]} The lists.
   */
  private placedListsOf(viewer: Viewer, space: PlacedSpace): PlacedList[] {
    return [...this.lists.values()]
      .filter((list: PlacedList): boolean => list.spaceId === space.id)
      .sort(
        (left: PlacedList, right: PlacedList): number =>
          left.position.getTime() - right.position.getTime() || compareText(left.id, right.id),
      )
      .flatMap((list: PlacedList): PlacedList[] => {
        const placed: PlacedList | null = this.placed(viewer, list);
        return placed === null ? [] : [placed];
      });
  }

  /**
   * Method placed
   *
   * @description
   * Gives a list the role of the viewer on it.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedList} list - The list.
   * @returns {PlacedList | null} The list with the role, `null` when the viewer has none.
   */
  private placed(viewer: Viewer, list: PlacedList): PlacedList | null {
    if (this.deletedLists.has(list.id) || this.deletedSpaces.has(list.spaceId)) {
      return null;
    }
    const space: PlacedSpace | undefined = this.spaces.get(list.spaceId);
    const role: AccessRole | null =
      space === undefined ? null : this.listRoleOf(viewer, space, list);
    return role === null ? null : { ...list, callerRole: role };
  }

  /**
   * Method trashAccessOf
   *
   * @description
   * The list as the trash reads it with the role of the viewer as if neither the list nor its
   * space were deleted: `deleted` when one of them is, else `archived` or `active`.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedList} list - The list.
   * @returns {TrashListAccess | null} The list and the role, `null` when the viewer would have none.
   */
  private trashAccessOf(viewer: Viewer, list: PlacedList): TrashListAccess | null {
    const space: PlacedSpace | undefined = this.spaces.get(list.spaceId);
    const role: AccessRole | null =
      space === undefined ? null : this.listRoleOf(viewer, space, list);
    if (role === null) {
      return null;
    }
    let state: TrashList['state'] = list.archivedAt === null ? 'active' : 'archived';
    if (this.deletedLists.has(list.id) || this.deletedSpaces.has(list.spaceId)) {
      state = 'deleted';
    }
    return {
      list: { id: list.id, spaceId: list.spaceId, name: list.name, state },
      role,
    };
  }

  /**
   * Method spaceRoleOf

   *
   * @description
   * The role of the viewer on a space itself: none for a guest; `edit` for the owner and for a
   * space of the organization; else the grant of the space.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {AccessRole | null} The role.
   */
  private spaceRoleOf(viewer: Viewer, space: PlacedSpace): AccessRole | null {
    if (viewer.role === 'guest') {
      return null;
    }
    return highestRole([
      space.ownerUserId === viewer.userId || space.visibility === 'organization' ? 'edit' : null,
      this.spaceGrants[space.id]?.[viewer.userId],
    ]);
  }

  /**
   * Method listRoleOf
   *
   * @description
   * The role of the viewer on a list: the grant of the list for anyone, guests included; for a
   * member other than a guest also `edit` as the owner of the space, `edit` in a space of the
   * organization when the switch of the list is on, and the grant of the space. Highest wins.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space of the list.
   * @param {PlacedList} list - The list.
   * @returns {AccessRole | null} The role.
   */
  private listRoleOf(viewer: Viewer, space: PlacedSpace, list: PlacedList): AccessRole | null {
    const listGrant: AccessRole | undefined = this.listGrants[list.id]?.[viewer.userId];
    if (viewer.role === 'guest') {
      return listGrant ?? null;
    }
    return highestRole([
      space.ownerUserId === viewer.userId ? 'edit' : null,
      space.visibility === 'organization' && list.organizationAccess ? 'edit' : null,
      this.spaceGrants[space.id]?.[viewer.userId],
      listGrant,
    ]);
  }

  /**
   * Method seesSpace
   *
   * @description
   * Whether the viewer sees a space: with a role on it, or through a role on one of its lists.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {boolean} Whether the viewer sees the space.
   */
  private seesSpace(viewer: Viewer, space: PlacedSpace): boolean {
    return this.spaceRoleOf(viewer, space) !== null || this.placedListsOf(viewer, space).length > 0;
  }

  /**
   * Method manages
   *
   * @description
   * Whether the viewer manages a space: never a guest; the owner of the space, or the owner or an
   * admin of the organization for a space of the organization.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {boolean} Whether they manage it.
   */
  private manages(viewer: Viewer, space: PlacedSpace): boolean {
    if (viewer.role === 'guest') {
      return false;
    }
    return (
      space.ownerUserId === viewer.userId ||
      (space.visibility === 'organization' && (viewer.role === 'owner' || viewer.role === 'admin'))
    );
  }
  // #endregion
}

/**
 * Builds the spaces of Atelier Nord with "Sprint 14" closed to the organization (its switch "Accès
 * de l’organisation" off) and shared with some accounts: Camille Martin, the owner of "Produit",
 * keeps `edit` on it; any other account, a guest included, has the role of its grant, or none.
 * Every other list is as usual.
 *
 * @param grants - The role of each account the list is shared with.
 * @param trace - The calls of every fake, in order.
 * @returns The fake spaces.
 */
export function sprint14SharedWith(
  grants: Readonly<Record<string, AccessRole>>,
  trace: string[] = [],
): InMemorySpaceDirectory {
  return new InMemorySpaceDirectory({
    lists: atelierNordLists({ organizationAccess: false }),
    listGrants: { [SPRINT_14]: grants },
    trace,
  });
}

/**
 * Class InMemoryMembers
 *
 * @description
 * A fake `MemberDirectory`: the roles of the copy of the members of Atelier Nord.
 */
export class InMemoryMembers implements MemberDirectory {
  // #region Properties
  /** The `roleOf` calls, as the account and the `lock` flag as it was passed. */
  public readonly roleCalls: { readonly userId: string; readonly lock: boolean | undefined }[] = [];

  /** The role of each account of Atelier Nord. */
  private readonly roles: ReadonlyMap<string, MemberRole>;

  /** The calls of every fake, in order. */
  private readonly trace: string[];
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the copy of Atelier Nord.
   *
   * @param {Readonly<Record<string, MemberRole>>} roles - The role of each account.
   * @param {string[]} [trace] - The calls of every fake, in order.
   * @constructor
   */
  public constructor(roles: Readonly<Record<string, MemberRole>>, trace: string[] = []) {
    this.roles = new Map(Object.entries(roles));
    this.trace = trace;
  }
  // #endregion

  // #region Methods
  /**
   * Method roleOf
   *
   * @description
   * Returns the role of an account, or `null` when the copy does not know it.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {boolean} [lock] - Whether the caller asked to lock the membership; only recorded.
   * @returns {Promise<MemberRole | null>} Its role.
   */
  public roleOf(
    organizationId: string,
    userId: string,
    lock?: boolean,
  ): Promise<MemberRole | null> {
    this.trace.push(`members.roleOf:${userId}:${lock === true ? 'lock' : 'read'}`);
    this.roleCalls.push({ userId, lock });
    return Promise.resolve(
      organizationId === ATELIER_NORD ? (this.roles.get(userId) ?? null) : null,
    );
  }
  // #endregion
}

/**
 * Builds the copy of the members of Atelier Nord: Camille Martin owns it, Inès Robert is an admin,
 * Hugo Dubois and Léa Petit are members and Nadia Benali is a guest.
 *
 * @param removed - Accounts whose membership the copy no longer holds.
 * @param trace - The calls of every fake, in order.
 * @returns The fake member directory.
 */
export function atelierNordMembers(
  removed: readonly string[] = [],
  trace: string[] = [],
): InMemoryMembers {
  const roles: Readonly<Record<string, MemberRole>> = {
    [CAMILLE]: 'owner',
    [INES]: 'admin',
    [HUGO]: 'member',
    [LEA]: 'member',
    [NADIA]: 'guest',
  };
  return new InMemoryMembers(
    Object.fromEntries(
      Object.entries(roles).filter(([userId]: [string, MemberRole]) => !removed.includes(userId)),
    ),
    trace,
  );
}

/** Fails when a spec reaches the graph without a dependency fixture. */
function dependencyFixtureMissing(): never {
  throw new Error('The dependency test fixture was not provided.');
}

/** Fixtures of unrelated task operations do not use the graph. */
const unavailableDependencies: TasksStore['dependencies'] = {
  lockGraph: dependencyFixtureMissing,
  findEdge: dependencyFixtureMissing,
  inspect: dependencyFixtureMissing,
  insert: dependencyFixtureMissing,
  remove: dependencyFixtureMissing,
  get: dependencyFixtureMissing,
  page: dependencyFixtureMissing,
  candidates: dependencyFixtureMissing,
};

/** What a spec seeds in the fake store. */
export interface InMemoryTasksSeed {
  // #region Properties
  /** The tasks already stored. */
  readonly tasks?: readonly TaskState[];

  /** The activity entries already stored. */
  readonly activity?: readonly ActivityEntryState[];

  /** The trash entries already stored. */
  readonly trashEntries?: readonly StoredTrashEntry[];

  /** The instant of the transaction. */
  readonly now?: Date;

  /** The calls of every fake, in order. */
  readonly trace?: string[];

  /** Graph adapter supplied only by dependency specs. */
  readonly dependencies?: TasksStore['dependencies'];
  // #endregion
}

/**
 * Builds the summary row of a task as a reader gives it.
 *
 * @param state - The task.
 * @param subtaskCounts - Its direct subtasks.
 * @param parentKey - The key of the parent it reads with; its stored parent's when left out.
 * @returns The summary.
 */
export function summaryOf(
  state: TaskState,
  subtaskCounts: SubtaskCounts,
  parentKey: string | null = state.parentKey === null ? null : state.parentKey.format(),
): TaskSummaryView {
  return {
    id: state.id,
    key: state.key.format(),
    name: state.name,
    status: state.status,
    cancelReason: state.cancelReason,
    priority: state.priority,
    assigneeIds: state.assigneeIds,
    dueDate: state.dueDate,
    startDate: state.startDate,
    estimateMinutes: state.estimateMinutes,
    ...(state.milestone === undefined ? {} : { milestone: state.milestone }),
    ...(state.recurrence === undefined ? {} : { recurrence: state.recurrence }),
    labels: state.labels,
    parentKey,
    listId: state.listId,
    spaceId: state.spaceId,
    subtaskCounts,
    checklistCounts: {
      total: state.checklist.length,
      done: state.checklist.filter((item: ChecklistItemState): boolean => item.done).length,
    },
    completedAt: state.completedAt,
    createdAt: state.createdAt,
    version: state.version,
  };
}

/**
 * Builds where a task is, as a reader gives it to another module.
 *
 * @param state - The task.
 * @returns The location.
 */
export function locationOf(state: TaskState): TaskLocation {
  return {
    id: state.id,
    key: state.key.format(),
    name: state.name,
    status: state.status,
    listId: state.listId,
    spaceId: state.spaceId,
  };
}

/** What the specs read of the calls the fake readers received, kept across the runs. */
export interface ReadRecords {
  // #region Properties
  /** The `pageOfList` calls. */
  readonly pages: {
    readonly listId: string;
    readonly filter: TaskFilter;
    readonly order: TaskOrder;
    readonly after: TaskPosition | null;
    readonly limit: number;
  }[];

  /** The lists of each `countsOfLists` call. */
  readonly counts: (readonly string[])[];

  /** The `pageAssignedTo` calls. */
  readonly assigned: {
    readonly state: MyTaskState;
    readonly after: TaskPosition | null;
    readonly limit: number;
  }[];

  /** The `pageOfLabels` calls. */
  readonly labels: {
    readonly listIds: readonly string[];
    readonly search: string | null;
    readonly limit: number;
  }[];

  /** The `groupsOfList` calls, as the grouping. */
  readonly groups: TaskGrouping[];
  // #endregion
}

/**
 * Folds a text the way "without regard to case or accents" does, as the SQL fold does: lower case
 * (`ß` as `ss`), the ligatures `œ` and `æ` and the stroked letters `ø ł đ ð ħ ŧ ı` that NFKD leaves
 * whole replaced by their plain letters, decomposed, marks removed.
 *
 * @param text - The text.
 * @returns The folded text.
 */
function fold(text: string): string {
  const plain: Readonly<Record<string, string>> = {
    ß: 'ss',
    œ: 'oe',
    æ: 'ae',
    ø: 'o',
    ł: 'l',
    đ: 'd',
    ð: 'd',
    ħ: 'h',
    ŧ: 't',
    ı: 'i',
  };
  return text
    .toLowerCase()
    .replace(/[ßœæøłđðħŧı]/gu, (letter: string): string => plain[letter] ?? letter)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '');
}

/**
 * Cuts a folded text to the first code points a sort key keeps (`SORT_KEY_PREFIX_LENGTH`).
 *
 * @param folded - The folded text.
 * @returns The prefix, counted in code points, not in UTF-16 units.
 */
function sortKeyOf(folded: string): string {
  return Array.from(folded).slice(0, SORT_KEY_PREFIX_LENGTH).join('');
}

/**
 * Class InMemoryTaskReads
 *
 * @description
 * A fake of the four read ports of the queries (`TaskQueryReader`, `TaskCounter`,
 * `AssignedTaskReader`, `LabelReader`) over the tasks of the unit of work, scoped to the
 * organization as the repositories are, and to the live tasks (`liveTask` of the statements). It
 * applies the filters, the closed and late rules and the orders of the contract just enough for a
 * use case to show its orchestration; the exact SQL
 * semantics (folding, keyset, collations) are proven against PostgreSQL. It pages by the id of the
 * position it is given.
 */
export class InMemoryTaskReads
  implements TaskQueryReader, TaskCounter, AssignedTaskReader, LabelReader
{
  // #region Properties
  /** The tasks of the unit of work. */
  private readonly rows: () => readonly TaskState[];

  /** Builds the summary row of a task. */
  private readonly summarize: (state: TaskState) => TaskSummaryView;

  /** The calls the specs read. */
  private readonly records: ReadRecords;

  /** The calls of every fake, in order. */
  private readonly trace: string[];
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Reads the tasks of one unit of work.
   *
   * @param {() => readonly TaskState[]} rows - The tasks of every organization.
   * @param {(state: TaskState) => TaskSummaryView} summarize - Builds the summary of a task.
   * @param {ReadRecords} records - Where the calls are recorded.
   * @param {string[]} trace - The calls of every fake, in order.
   * @constructor
   */
  public constructor(
    rows: () => readonly TaskState[],
    summarize: (state: TaskState) => TaskSummaryView,
    records: ReadRecords,
    trace: string[],
  ) {
    this.rows = rows;
    this.summarize = summarize;
    this.records = records;
    this.trace = trace;
  }
  // #endregion

  // #region Methods
  /** Returns the eligible milestone page in the same order as persistence. */
  public milestones(
    organizationId: string,
    listIds: readonly string[],
    after: MilestonePosition | null,
    limit: number,
  ): Promise<readonly TaskSummaryView[]> {
    const key = (position: MilestonePosition): string =>
      `${position.dueDate ?? 'undated'}:${position.id}`;
    const rows = this.matchingMilestones(organizationId, listIds);
    return Promise.resolve(
      rows
        .filter((row) => after === null || key(row) > key(after))
        .sort((left, right) => compareText(key(left), key(right)))
        .slice(0, limit)
        .map(this.summarize),
    );
  }

  /** Counts the live milestones in the allowed lists. */
  public milestoneTotal(organizationId: string, listIds: readonly string[]): Promise<number> {
    return Promise.resolve(this.matchingMilestones(organizationId, listIds).length);
  }

  /** Applies the tenant, list, lifecycle and milestone restrictions shared by the readers. */
  private matchingMilestones(organizationId: string, listIds: readonly string[]): TaskState[] {
    return this.rows().filter(
      (row) =>
        row.organizationId === organizationId &&
        listIds.includes(row.listId) &&
        row.milestone === true &&
        isLiveState(row),
    );
  }

  /**
   * Method pageOfList
   *
   * @description
   * Reads the tasks of a list that match a filter, in an order.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskOrder} order - The order of the page.
   * @param {TaskPosition | null} after - The last task of the previous page.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks.
   */
  public pageOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    order: TaskOrder,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]> {
    this.trace.push('queries.pageOfList');
    this.records.pages.push({ listId, filter, order, after, limit });
    const sorted: TaskState[] = this.inOrder(this.matching(organizationId, listId, filter), order);
    const start: number = after === null ? 0 : this.indexAfter(sorted, after.id);
    return Promise.resolve(
      sorted.slice(start, start + limit).map((state: TaskState): ListedTask => ({
        task: this.summarize(state),
        position: {
          sortValue: this.sortValueOf(state, order),
          createdAt: state.createdAt,
          id: state.id,
        },
      })),
    );
  }

  /**
   * Method countOfList
   *
   * @description
   * Counts the tasks of a list that match a filter.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @returns {Promise<number>} The count.
   */
  public countOfList(organizationId: string, listId: string, filter: TaskFilter): Promise<number> {
    this.trace.push('queries.countOfList');
    return Promise.resolve(this.matching(organizationId, listId, filter).length);
  }

  /**
   * Method groupsOfList
   *
   * @description
   * Counts the tasks of a list that match a filter by status, priority or assignee; the groups
   * without a task are left out, except `none` of the assignees, which is always counted. The
   * total counts the matching tasks once.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @param {TaskGrouping} grouping - What the tasks are counted by.
   * @returns {Promise<TaskGroupCountsView>} The groups, in the order the fake met them, and the
   * total.
   */
  public groupsOfList(
    organizationId: string,
    listId: string,
    filter: TaskFilter,
    grouping: TaskGrouping,
  ): Promise<TaskGroupCountsView> {
    this.trace.push('queries.groupsOfList');
    this.records.groups.push(grouping);
    const counts = new Map<string, number>();
    const add = (value: string): void => {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    };
    if (grouping === 'assignee') {
      counts.set('none', 0);
    }
    const matching: TaskState[] = this.matching(organizationId, listId, filter);
    for (const state of matching) {
      if (grouping === 'status') {
        add(state.status);
      } else if (grouping === 'priority') {
        add(state.priority);
      } else if (state.assigneeIds.length === 0) {
        add('none');
      } else {
        state.assigneeIds.forEach(add);
      }
    }
    return Promise.resolve({
      groups: [...counts.entries()].map(([value, count]: [string, number]): TaskGroupView => ({
        value,
        count,
      })),
      total: matching.length,
    });
  }

  /**
   * Method countsOfLists
   *
   * @description
   * Counts the top-level tasks of lists; a list without a task is left out.
   *
   * @param {string} organizationId - The organization.
   * @param {readonly string[]} listIds - The lists.
   * @param {string} today - The date of the caller.
   * @returns {Promise<ReadonlyMap<string, TaskCountsView>>} The counts by list id.
   */
  public countsOfLists(
    organizationId: string,
    listIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, TaskCountsView>> {
    this.trace.push('counter.countsOfLists');
    this.records.counts.push(listIds);
    const counts = new Map<string, TaskCountsView>();
    for (const state of this.rows()) {
      if (
        state.organizationId !== organizationId ||
        state.parentId !== null ||
        !isLiveState(state) ||
        !listIds.includes(state.listId)
      ) {
        continue;
      }
      const before: TaskCountsView = counts.get(state.listId) ?? {
        total: 0,
        open: 0,
        done: 0,
        cancelled: 0,
        late: 0,
      };
      counts.set(state.listId, {
        total: before.total + 1,
        open: before.open + (isClosedStatus(state.status) ? 0 : 1),
        done: before.done + (state.status === 'done' ? 1 : 0),
        cancelled: before.cancelled + (state.status === 'cancelled' ? 1 : 0),
        late: before.late + (isLate(state.status, state.dueDate, today) ? 1 : 0),
      });
    }
    return Promise.resolve(counts);
  }

  /**
   * Method stateCountsOf
   *
   * @description
   * Counts the tasks assigned to an account in some lists, subtasks included, by tab.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @returns {Promise<MyTaskCountsView>} The counts.
   */
  public stateCountsOf(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
  ): Promise<MyTaskCountsView> {
    this.trace.push('counter.stateCountsOf');
    const assigned: TaskState[] = this.assignedTo(organizationId, userId, listIds);
    const closed: number = assigned.filter((state: TaskState): boolean =>
      isClosedStatus(state.status),
    ).length;
    return Promise.resolve({ open: assigned.length - closed, closed });
  }

  /**
   * Method homeStatsOf
   *
   * @description
   * Counts the tasks assigned to an account in some lists, subtasks included, for "Accueil".
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {string} today - The date of the caller.
   * @returns {Promise<HomeStatsView>} The counters.
   */
  public homeStatsOf(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
    today: string,
  ): Promise<HomeStatsView> {
    this.trace.push('counter.homeStatsOf');
    const open: TaskState[] = this.assignedTo(organizationId, userId, listIds).filter(
      (state: TaskState): boolean => !isClosedStatus(state.status),
    );
    return Promise.resolve({
      assigned: open.length,
      late: open.filter((state: TaskState): boolean => isLate(state.status, state.dueDate, today))
        .length,
      dueToday: open.filter((state: TaskState): boolean => state.dueDate === today).length,
      done: this.assignedTo(organizationId, userId, listIds).filter(
        (state: TaskState): boolean => state.status === 'done',
      ).length,
    });
  }

  /**
   * Method pageAssignedTo
   *
   * @description
   * Reads the tasks assigned to an account in some lists, by due date (undated last), then in the
   * order of creation.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {MyTaskState} state - The tab.
   * @param {TaskPosition | null} after - The last task of the previous page.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedTask[]>} The tasks.
   */
  public pageAssignedTo(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
    state: MyTaskState,
    after: TaskPosition | null,
    limit: number,
  ): Promise<readonly ListedTask[]> {
    this.trace.push('assigned.pageAssignedTo');
    this.records.assigned.push({ state, after, limit });
    const sorted: TaskState[] = this.assignedTo(organizationId, userId, listIds)
      .filter((row: TaskState): boolean => isClosedStatus(row.status) === (state === 'closed'))
      .sort(
        (left: TaskState, right: TaskState): number =>
          this.dueFirst(left, right) || byCreation(left, right),
      );
    const start: number = after === null ? 0 : this.indexAfter(sorted, after.id);
    return Promise.resolve(
      sorted.slice(start, start + limit).map((row: TaskState): ListedTask => ({
        task: this.summarize(row),
        position: { sortValue: row.dueDate, createdAt: row.createdAt, id: row.id },
      })),
    );
  }

  /**
   * Method pageOfLabels
   *
   * @description
   * Reads the labels of the tasks in some lists, each once per key, by folded name then key, in
   * the spelling that comes first.
   *
   * @param {string} organizationId - The organization.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @param {string | null} search - The text to find in the labels.
   * @param {LabelPosition | null} after - The last label of the previous page.
   * @param {number} limit - How many rows at most.
   * @returns {Promise<readonly ListedLabel[]>} The labels.
   */
  public pageOfLabels(
    organizationId: string,
    listIds: readonly string[],
    search: string | null,
    after: LabelPosition | null,
    limit: number,
  ): Promise<readonly ListedLabel[]> {
    this.trace.push('labels.pageOfLabels');
    this.records.labels.push({ listIds, search, limit });
    const names = new Map<string, string>();
    for (const state of this.rows()) {
      if (
        state.organizationId !== organizationId ||
        !isLiveState(state) ||
        !listIds.includes(state.listId)
      ) {
        continue;
      }
      for (const name of state.labels) {
        const key: string = labelKey(name);
        const first: string | undefined = names.get(key);
        names.set(key, first === undefined || compareText(name, first) < 0 ? name : first);
      }
    }
    const needle: string | null = search === null ? null : fold(search);
    const listed: ListedLabel[] = [...names.entries()]
      .filter(
        ([key]: [string, string]): boolean =>
          needle === null || (needle !== '' && fold(key).includes(needle)),
      )
      .map(([key, name]: [string, string]): ListedLabel => ({
        label: { name },
        position: { sortKey: sortKeyOf(fold(key)), labelKey: key },
      }))
      .sort(
        (left: ListedLabel, right: ListedLabel): number =>
          compareText(left.position.sortKey, right.position.sortKey) ||
          compareText(left.position.labelKey, right.position.labelKey),
      )
      .filter(
        (row: ListedLabel): boolean =>
          after === null ||
          compareText(row.position.sortKey, after.sortKey) > 0 ||
          (row.position.sortKey === after.sortKey &&
            compareText(row.position.labelKey, after.labelKey) > 0),
      );
    return Promise.resolve(listed.slice(0, limit));
  }

  /**
   * Method matching
   *
   * @description
   * Finds the tasks of a list of an organization that match a filter.
   *
   * @param {string} organizationId - The organization.
   * @param {string} listId - The list.
   * @param {TaskFilter} filter - What the tasks must match.
   * @returns {TaskState[]} The tasks.
   */
  private matching(organizationId: string, listId: string, filter: TaskFilter): TaskState[] {
    const { statuses, priorities, assignees, labelKeys, search, dueFrom, dueTo } = filter;
    return this.rows().filter((state: TaskState): boolean => {
      if (
        state.organizationId !== organizationId ||
        state.listId !== listId ||
        !isLiveState(state)
      ) {
        return false;
      }
      if (filter.rootsOnly && state.parentId !== null) {
        return false;
      }
      if (statuses !== null && !statuses.includes(state.status)) {
        return false;
      }
      if (priorities !== null && !priorities.includes(state.priority)) {
        return false;
      }
      if (
        assignees !== null &&
        !state.assigneeIds.some((id: string): boolean => assignees.userIds.includes(id)) &&
        !(assignees.unassigned && state.assigneeIds.length === 0)
      ) {
        return false;
      }
      if (
        labelKeys !== null &&
        !state.labels.some((name: string): boolean => labelKeys.includes(labelKey(name)))
      ) {
        return false;
      }
      if (
        search !== null &&
        ![state.name, state.key.format(), ...state.labels].some(
          (text: string): boolean => fold(search) !== '' && fold(text).includes(fold(search)),
        )
      ) {
        return false;
      }
      return (
        (dueFrom === null || (state.dueDate !== null && state.dueDate >= dueFrom)) &&
        (dueTo === null || (state.dueDate !== null && state.dueDate <= dueTo))
      );
    });
  }

  /**
   * Method assignedTo
   *
   * @description
   * Finds the tasks assigned to an account in some lists, subtasks included.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account.
   * @param {readonly string[]} listIds - The lists the actor has a role on.
   * @returns {TaskState[]} The tasks.
   */
  private assignedTo(
    organizationId: string,
    userId: string,
    listIds: readonly string[],
  ): TaskState[] {
    return this.rows().filter(
      (state: TaskState): boolean =>
        state.organizationId === organizationId &&
        isLiveState(state) &&
        state.assigneeIds.includes(userId) &&
        listIds.includes(state.listId),
    );
  }

  /**
   * Method inOrder
   *
   * @description
   * Sorts tasks: the order of the list for `manual` and `createdAt`; the due date with the undated
   * last, the rank of the priority or the folded name otherwise, ties in the order of the list. A
   * leading `-` reverses the key only, except for `manual` and `createdAt`, and keeps the undated
   * last.
   *
   * @param {TaskState[]} rows - The tasks, sorted in place.
   * @param {TaskOrder} order - The order.
   * @returns {TaskState[]} The same tasks, sorted.
   */
  private inOrder(rows: TaskState[], order: TaskOrder): TaskState[] {
    const sign: number = order.descending ? -1 : 1;
    return rows.sort((left: TaskState, right: TaskState): number => {
      if (order.key === 'manual' || order.key === 'createdAt') {
        return sign * byCreation(left, right);
      }
      if (order.key === 'dueDate') {
        return this.dueFirst(left, right, sign) || byCreation(left, right);
      }
      const leftValue: string | number | null = this.sortValueOf(left, order);
      const rightValue: string | number | null = this.sortValueOf(right, order);
      const delta: number =
        typeof leftValue === 'number' && typeof rightValue === 'number'
          ? leftValue - rightValue
          : compareText(String(leftValue), String(rightValue));
      return sign * delta || byCreation(left, right);
    });
  }

  /**
   * Method sortValueOf
   *
   * @description
   * The value an order sorts a task by, as its position holds it.
   *
   * @param {TaskState} state - The task.
   * @param {TaskOrder} order - The order.
   * @returns {string | number | null} The due date, the rank of the priority, the folded prefix of
   * the name, or `null` for the order of creation.
   */
  private sortValueOf(state: TaskState, order: TaskOrder): string | number | null {
    switch (order.key) {
      case 'dueDate':
        return state.dueDate;
      case 'priority':
        return PRIORITY_KEYS.indexOf(state.priority) + 1;
      case 'name':
        return sortKeyOf(fold(state.name));
      default:
        return null;
    }
  }

  /**
   * Method dueFirst
   *
   * @description
   * Compares two tasks by due date, a task without one always after those with one.
   *
   * @param {TaskState} left - The first task.
   * @param {TaskState} right - The second task.
   * @param {number} [sign] - 1 for the earliest first, -1 for the latest first.
   * @returns {number} A negative number, 0 or a positive number.
   */
  private dueFirst(left: TaskState, right: TaskState, sign: number = 1): number {
    if (left.dueDate === null || right.dueDate === null) {
      return left.dueDate === right.dueDate ? 0 : left.dueDate === null ? 1 : -1;
    }
    return sign * compareText(left.dueDate, right.dueDate);
  }

  /**
   * Method indexAfter
   *
   * @description
   * Finds where the rows after a position start.
   *
   * @param {readonly TaskState[]} sorted - The rows, in the order of the page.
   * @param {string} id - The id of the last row of the previous page.
   * @returns {number} The index after that row, the end when it is not in the rows.
   */
  private indexAfter(sorted: readonly TaskState[], id: string): number {
    const index: number = sorted.findIndex((state: TaskState): boolean => state.id === id);
    return index === -1 ? sorted.length : index + 1;
  }
  // #endregion
}

/**
 * Class InMemoryTasks
 *
 * @description
 * A fake `TasksUnitOfWork` holding the tasks, the activity and the outbox in memory, with no
 * database: the work runs on a copy that is committed only when it resolves, as the tenant
 * transaction is, so a refusal leaves no row and no event. It scopes every read to the
 * organization as the repositories do, records the order of the locks and keeps the transaction
 * instant fixed. It applies the conditions of the statements: the live tasks only in every
 * collection and count, the subtasks of a task those of its archive, the live subtree and child
 * count of a write, the parent a task reads with (none when the parent is in another list,
 * `showsParent`, in the summaries and the references), the locks without checklists (the members
 * of an archive, `lockByIds` without them) and the bulk write of an archive, guarded by the
 * versions, which keeps the stored checklists. For the trash it applies the same conditions as
 * its statements: a task in the trash is not live, the subtask reads and the locations leave it
 * out, a parent in the trash reads as detached; the entries read with their root, the page and
 * its total keep the entries still in the trash of the given lists, the most recently deleted
 * first, the hand-over and the due entries lock the oldest first, and an erasure deletes the
 * collections and the activity of the tasks of its entries, detaches the tasks outside them that
 * hung from one of their tasks, and deletes the tasks and the entries. The jobs enqueued commit
 * with the work, as the job rows of a transaction do.
 */
export class InMemoryTasks implements TasksUnitOfWork {
  // #region Properties
  /** The committed tasks by id. */
  public tasks: Map<string, TaskState>;

  /** The committed activity entries by id, in insertion order. */
  public activity: Map<string, ActivityEntryState>;

  /** The events of the committed work, in the order they were appended. */
  public events: RecordedEvent[] = [];

  /** The committed trash entries by id. */
  public trashEntries: Map<string, StoredTrashEntry>;

  /** The jobs of the committed work, in the order they were enqueued. */
  public jobs: RecordedJob[] = [];

  /** The instant of the transaction; change it between two runs to age the entries. */
  public now: Date;

  /** How many units of work started, committed or not. */
  public runs: number = 0;

  /** How many read-only runs started; their writes are dropped as the database would refuse them. */
  public readOnlyRuns: number = 0;

  /** How many of the read-only runs asked for one snapshot. */
  public snapshotRuns: number = 0;

  /** The calls the fake readers of the queries received, across the runs. */
  public readonly reads: ReadRecords = {
    pages: [],
    counts: [],
    assigned: [],
    labels: [],
    groups: [],
  };

  /** The calls of every fake, in order. */
  public readonly trace: string[];

  /** The graph adapter, when this fixture is used by dependency specs. */
  private readonly dependencies: TasksStore['dependencies'];

  /**
   * The ids of the tasks another transaction holds `FOR NO KEY UPDATE` or `FOR UPDATE` (a change
   * or a deletion under way): `shareLocationUnlessLocked` leaves them out, as
   * `FOR SHARE SKIP LOCKED` does; every other lock ignores them.
   */
  public readonly heldByWriter: Set<string> = new Set<string>();

  /** Counter of the ids the fake gives. */
  private sequence: number = 1000;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Starts with committed rows.
   *
   * @param {InMemoryTasksSeed} seed - What is already stored.
   * @constructor
   */
  public constructor(seed: InMemoryTasksSeed = {}) {
    this.tasks = new Map(
      (seed.tasks ?? []).map((row: TaskState): [string, TaskState] => [row.id, row]),
    );
    this.activity = new Map(
      (seed.activity ?? []).map((row: ActivityEntryState): [string, ActivityEntryState] => [
        row.id,
        row,
      ]),
    );
    this.now = seed.now ?? NOW;
    this.trace = seed.trace ?? [];
    this.dependencies = seed.dependencies ?? unavailableDependencies;
    this.trashEntries = new Map(
      (seed.trashEntries ?? []).map((row: StoredTrashEntry): [string, StoredTrashEntry] => [
        row.id,
        row,
      ]),
    );
  }
  // #endregion

  // #region Methods
  /**
   * Method withCad482
   *
   * @description
   * Builds the store of a spec: CAD-482 in Sprint 14.
   *
   * @param {Partial<InMemoryTasksSeed>} [seed] - What replaces the usual content.
   * @returns {InMemoryTasks} The fake.
   */
  public static withCad482(seed: InMemoryTasksSeed = {}): InMemoryTasks {
    return new InMemoryTasks({ tasks: [taskState()], ...seed });
  }

  /**
   * Method stored
   *
   * @description
   * Reads the committed state of a task.
   *
   * @param {string} id - The task.
   * @returns {TaskState} Its state.
   * @throws {Error} When the task is not stored.
   */
  public stored(id: string): TaskState {
    const state: TaskState | undefined = this.tasks.get(id);
    if (state === undefined) {
      throw new Error('The task is not stored.');
    }
    return state;
  }

  /**
   * Method entries
   *
   * @description
   * Lists the committed entries of a task, in insertion order.
   *
   * @param {string} taskId - The task.
   * @returns {ActivityEntryState[]} The entries.
   */
  public entriesOf(taskId: string): ActivityEntryState[] {
    return [...this.activity.values()].filter(
      (entry: ActivityEntryState): boolean => entry.taskId === taskId,
    );
  }

  /**
   * Method run
   *
   * @description
   * Runs the work on a copy of the rows and of the outbox, committed when it resolves and dropped
   * when it rejects.
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(work: (store: TasksStore) => Promise<TResult>): Promise<TResult> {
    this.runs += 1;
    const tasks = new Map<string, TaskState>(this.tasks);
    const activity = new Map<string, ActivityEntryState>(this.activity);
    const events: RecordedEvent[] = [...this.events];
    const entries = new Map<string, StoredTrashEntry>(this.trashEntries);
    const jobs: RecordedJob[] = [...this.jobs];
    const result: TResult = await work(this.store(tasks, activity, events, entries, jobs));
    this.tasks = tasks;
    this.activity = activity;
    this.events = events;
    this.trashEntries = entries;
    this.jobs = jobs;
    return result;
  }

  /**
   * Method runReadOnly
   *
   * @description
   * Runs the read on a copy of the rows that is always dropped, as a read-only transaction writes
   * nothing, and counts the run (and the snapshot, when asked).
   *
   * @param {(store: TasksStore) => Promise<TResult>} work - The read.
   * @param {ReadOptions} [options] - How the run sees the database.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async runReadOnly<TResult>(
    work: (store: TasksStore) => Promise<TResult>,
    options: ReadOptions = {},
  ): Promise<TResult> {
    this.runs += 1;
    this.readOnlyRuns += 1;
    if (options.snapshot === true) {
      this.snapshotRuns += 1;
    }
    return work(
      this.store(
        new Map<string, TaskState>(this.tasks),
        new Map<string, ActivityEntryState>(this.activity),
        [...this.events],
        new Map<string, StoredTrashEntry>(this.trashEntries),
        [...this.jobs],
      ),
    );
  }

  /**
   * Method store
   *
   * @description
   * Builds the store bound to the working copy of a unit of work.
   *
   * @param {Map<string, TaskState>} tasks - The working copy of the tasks.
   * @param {Map<string, ActivityEntryState>} activity - The working copy of the entries.
   * @param {RecordedEvent[]} events - The working copy of the outbox.
   * @param {Map<string, StoredTrashEntry>} entries - The working copy of the trash entries.
   * @param {RecordedJob[]} jobs - The working copy of the jobs.
   * @returns {TasksStore} The store.
   */
  private store(
    tasks: Map<string, TaskState>,
    activity: Map<string, ActivityEntryState>,
    events: RecordedEvent[],
    entries: Map<string, StoredTrashEntry>,
    jobs: RecordedJob[],
  ): TasksStore {
    const inOrganization = (organizationId: string): TaskState[] =>
      [...tasks.values()].filter(
        (row: TaskState): boolean => row.organizationId === organizationId,
      );
    const rootOf = (state: TaskState | undefined): string | null =>
      state?.archive === null || state === undefined ? null : state.archive.rootId;
    // The archive a task is in, among the archives: an archived task in the trash keeps its
    // archive but is out of the archives (`untrashedTask` in the archives statements).
    const archiveOf = (state: TaskState | undefined): string | null =>
      state?.trash !== null ? null : rootOf(state);
    // The subtasks of a task are those of its archive, never one in the trash
    // (`sameArchiveAsParent`).
    const childrenOf = (organizationId: string, parentId: string): TaskState[] =>
      inOrganization(organizationId)
        .filter(
          (row: TaskState): boolean =>
            row.parentId === parentId &&
            row.trash === null &&
            rootOf(row) === rootOf(tasks.get(parentId)),
        )
        .sort(
          (left: TaskState, right: TaskState): number =>
            left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
        );
    // The live subtasks of a task, which a write moves, locks and counts (`liveTask`).
    const liveChildrenOf = (organizationId: string, parentId: string): TaskState[] =>
      childrenOf(organizationId, parentId).filter((row: TaskState): boolean => isLiveState(row));
    // The parent a task reads with: none when its parent is in another list or in the trash
    // (`showsParent`), as the summaries, the views and the detail read it from the parent row.
    const parentKeyShown = (state: TaskState): string | null => {
      const parent: TaskState | undefined =
        state.parentId === null ? undefined : tasks.get(state.parentId);
      return state.parentKey === null ||
        parent === undefined ||
        !showsParent(state.listId, parent.listId, parent.trash !== null)
        ? null
        : state.parentKey.format();
    };
    // Whether a task reads as top-level: no parent, or a parent in another list or in the trash
    // (`showsParent`), as the roots of the entries of a deleted list are read.
    const readsTopLevel = (state: TaskState): boolean => {
      const parent: TaskState | undefined =
        state.parentId === null ? undefined : tasks.get(state.parentId);
      return (
        parent === undefined || !showsParent(state.listId, parent.listId, parent.trash !== null)
      );
    };
    const countsOf = (organizationId: string, taskId: string): SubtaskCounts => {
      const children: TaskState[] = childrenOf(organizationId, taskId);
      return {
        total: children.length,
        closed: children.filter(
          (row: TaskState): boolean => row.status === 'done' || row.status === 'cancelled',
        ).length,
      };
    };
    const matchesKinds = (
      entry: ActivityEntryState,
      kinds: readonly ActivityKind[] | null,
    ): boolean => kinds === null || kinds.includes(entry.change.kind);
    const recent = (
      rows: ActivityEntryState[],
      after: ActivityPosition | null,
    ): ActivityEntryState[] =>
      rows
        .sort(
          (left: ActivityEntryState, right: ActivityEntryState): number =>
            right.occurredAt.getTime() - left.occurredAt.getTime() ||
            right.id.localeCompare(left.id),
        )
        .filter(
          (row: ActivityEntryState): boolean =>
            after === null ||
            row.occurredAt.getTime() < after.occurredAt.getTime() ||
            (row.occurredAt.getTime() === after.occurredAt.getTime() && row.id < after.id),
        );
    const insertDraft = (draft: TaskDraft, key: TaskKey): TaskState => {
      const state: TaskState = {
        ...draft,
        id: this.nextId('019a7200'),
        key,
        checklist: [],
        createdAt: this.now,
        updatedAt: this.now,
        version: 1,
        archive: null,
        trash: null,
      };
      tasks.set(state.id, state);
      return state;
    };
    // The roots of the archives of some lists, the most recently archived first.
    const rootsOf = (organizationId: string, listIds: readonly string[]): TaskState[] =>
      inOrganization(organizationId)
        .filter(
          (row: TaskState): boolean => archiveOf(row) === row.id && listIds.includes(row.listId),
        )
        .sort(
          (left: TaskState, right: TaskState): number =>
            (right.archive?.at.getTime() ?? 0) - (left.archive?.at.getTime() ?? 0) ||
            compareText(right.id, left.id),
        );
    const inList = (organizationId: string, filter: ListActivityFilter): ActivityEntryState[] =>
      [...activity.values()].filter((entry: ActivityEntryState): boolean => {
        const task: TaskState | undefined = tasks.get(entry.taskId);
        return (
          entry.organizationId === organizationId &&
          entry.listId === filter.listId &&
          task !== undefined &&
          isLiveState(task) &&
          filter.listIds.includes(task.listId) &&
          matchesKinds(entry, filter.kinds) &&
          (filter.actorIds === null || filter.actorIds.includes(entry.actor.id))
        );
      });
    const reads = new InMemoryTaskReads(
      (): readonly TaskState[] => [...tasks.values()],
      (state: TaskState): TaskSummaryView =>
        summaryOf(state, countsOf(state.organizationId, state.id), parentKeyShown(state)),
      this.reads,
      this.trace,
    );
    const archives: ArchiveReader = {
      pageOfRoots: (
        organizationId: string,
        listIds: readonly string[],
        after: ArchivePosition | null,
        limit: number,
      ): Promise<readonly ArchivedRootView[]> => {
        this.trace.push('archives.pageOfRoots');
        return Promise.resolve(
          rootsOf(organizationId, listIds)
            .filter(
              (row: TaskState): boolean =>
                after === null ||
                (row.archive?.at.getTime() ?? 0) < after.archivedAt.getTime() ||
                ((row.archive?.at.getTime() ?? 0) === after.archivedAt.getTime() &&
                  row.id < after.id),
            )
            .slice(0, limit)
            .flatMap((row: TaskState): ArchivedRootView[] =>
              row.archive === null
                ? []
                : [
                    {
                      task: summaryOf(row, countsOf(organizationId, row.id), parentKeyShown(row)),
                      archivedAt: row.archive.at,
                      archivedBy: row.archive.by,
                    },
                  ],
            ),
        );
      },
      countRoots: (organizationId: string, listIds: readonly string[]): Promise<number> => {
        this.trace.push('archives.countRoots');
        return Promise.resolve(rootsOf(organizationId, listIds).length);
      },
      memberCounts: (
        organizationId: string,
        rootIds: readonly string[],
      ): Promise<ReadonlyMap<string, number>> => {
        this.trace.push('archives.memberCounts');
        const counts = new Map<string, number>();
        for (const row of inOrganization(organizationId)) {
          const rootId: string | null = archiveOf(row);
          if (rootId !== null && rootIds.includes(rootId)) {
            counts.set(rootId, (counts.get(rootId) ?? 0) + 1);
          }
        }
        return Promise.resolve(counts);
      },
      liveRootCounts: (
        organizationId: string,
        listIds: readonly string[],
      ): Promise<ReadonlyMap<string, number>> => {
        this.trace.push('archives.liveRootCounts');
        const counts = new Map<string, number>();
        for (const row of inOrganization(organizationId)) {
          if (isLiveState(row) && row.parentId === null && listIds.includes(row.listId)) {
            counts.set(row.listId, (counts.get(row.listId) ?? 0) + 1);
          }
        }
        return Promise.resolve(counts);
      },
    };
    // An entry with its root as the statements join it; an entry whose root is gone is not read.
    const recordOf = (entry: StoredTrashEntry): TrashEntryRecord[] => {
      const root: TaskState | undefined = tasks.get(entry.rootTaskId);
      return root?.organizationId !== entry.organizationId
        ? []
        : [
            {
              ...entry,
              root: { key: root.key.format(), name: root.name, status: root.status },
            },
          ];
    };
    const entriesOf = (organizationId: string): StoredTrashEntry[] =>
      [...entries.values()].filter(
        (entry: StoredTrashEntry): boolean => entry.organizationId === organizationId,
      );
    // The entries of some lists still in the trash, the most recently deleted first.
    const inTrashOf = (organizationId: string, listIds: readonly string[]): StoredTrashEntry[] =>
      entriesOf(organizationId)
        .filter(
          (entry: StoredTrashEntry): boolean =>
            entry.purgeRequest === null && listIds.includes(entry.listId),
        )
        .sort(
          (left: StoredTrashEntry, right: StoredTrashEntry): number =>
            right.trashedAt.getTime() - left.trashedAt.getTime() || compareText(right.id, left.id),
        );
    const trash: TrashEntryRepository = {
      insertMany: (drafts: readonly TrashEntryDraft[]): Promise<readonly TrashEntryRecord[]> => {
        this.trace.push('trash.insertMany');
        return Promise.resolve(
          drafts.flatMap((draft: TrashEntryDraft): TrashEntryRecord[] => {
            const entry: StoredTrashEntry = {
              ...draft,
              id: this.nextId('019a7006'),
              purgeRequest: null,
            };
            entries.set(entry.id, entry);
            return recordOf(entry);
          }),
        );
      },
      find: (organizationId: string, entryId: string): Promise<TrashEntryRecord | null> => {
        this.trace.push('trash.find');
        const entry: StoredTrashEntry | undefined = entries.get(entryId);
        return Promise.resolve(
          entry?.organizationId === organizationId ? (recordOf(entry)[0] ?? null) : null,
        );
      },
      lock: (organizationId: string, entryId: string): Promise<TrashEntryRecord | null> => {
        this.trace.push('trash.lock');
        const entry: StoredTrashEntry | undefined = entries.get(entryId);
        return Promise.resolve(
          entry?.organizationId === organizationId ? (recordOf(entry)[0] ?? null) : null,
        );
      },
      pageOfLists: (
        organizationId: string,
        listIds: readonly string[],
        after: TrashPosition | null,
        limit: number,
      ): Promise<readonly TrashEntryRecord[]> => {
        this.trace.push('trash.pageOfLists');
        return Promise.resolve(
          inTrashOf(organizationId, listIds)
            .filter(
              (entry: StoredTrashEntry): boolean =>
                after === null ||
                entry.trashedAt.getTime() < after.trashedAt.getTime() ||
                (entry.trashedAt.getTime() === after.trashedAt.getTime() &&
                  compareText(entry.id, after.id) < 0),
            )
            .slice(0, limit)
            .flatMap(recordOf),
        );
      },
      countOfLists: (organizationId: string, listIds: readonly string[]): Promise<number> => {
        this.trace.push('trash.countOfLists');
        return Promise.resolve(inTrashOf(organizationId, listIds).length);
      },
      lockInTrashOfLists: (
        organizationId: string,
        listIds: readonly string[],
      ): Promise<readonly { readonly id: string; readonly listId: string }[]> => {
        this.trace.push('trash.lockInTrashOfLists');
        return Promise.resolve(
          inTrashOf(organizationId, listIds)
            .sort((left: StoredTrashEntry, right: StoredTrashEntry): number =>
              compareText(left.id, right.id),
            )
            .map((entry: StoredTrashEntry) => ({ id: entry.id, listId: entry.listId })),
        );
      },
      requestPurge: (
        organizationId: string,
        entryIds: readonly string[],
        at: Date,
        by: TaskActor,
      ): Promise<number> => {
        this.trace.push('trash.requestPurge');
        const handed: StoredTrashEntry[] = entriesOf(organizationId).filter(
          (entry: StoredTrashEntry): boolean =>
            entry.purgeRequest === null && entryIds.includes(entry.id),
        );
        for (const entry of handed) {
          entries.set(entry.id, { ...entry, purgeRequest: { at, by } });
        }
        return Promise.resolve(handed.length);
      },
      lockHandedOver: (
        organizationId: string,
        limit: number,
      ): Promise<readonly TrashEntryRecord[]> => {
        this.trace.push('trash.lockHandedOver');
        return Promise.resolve(
          entriesOf(organizationId)
            .filter((entry: StoredTrashEntry): boolean => entry.purgeRequest !== null)
            .sort(
              (left: StoredTrashEntry, right: StoredTrashEntry): number =>
                (left.purgeRequest?.at.getTime() ?? 0) - (right.purgeRequest?.at.getTime() ?? 0) ||
                compareText(left.id, right.id),
            )
            .slice(0, limit)
            .flatMap(recordOf),
        );
      },
      lockDue: (
        organizationId: string,
        dueBefore: Date,
        limit: number,
      ): Promise<readonly TrashEntryRecord[]> => {
        this.trace.push('trash.lockDue');
        return Promise.resolve(
          entriesOf(organizationId)
            .filter(
              (entry: StoredTrashEntry): boolean =>
                entry.purgeRequest === null && entry.trashedAt.getTime() <= dueBefore.getTime(),
            )
            .sort(
              (left: StoredTrashEntry, right: StoredTrashEntry): number =>
                left.trashedAt.getTime() - right.trashedAt.getTime() ||
                compareText(left.id, right.id),
            )
            .slice(0, limit)
            .flatMap(recordOf),
        );
      },
      erase: (organizationId: string, entryIds: readonly string[]): Promise<void> => {
        this.trace.push('trash.erase');
        const erased: ReadonlySet<string> = new Set(
          inOrganization(organizationId)
            .filter(
              (row: TaskState): boolean =>
                row.trash !== null && entryIds.includes(row.trash.entryId),
            )
            .map((row: TaskState): string => row.id),
        );
        for (const [id, entry] of activity) {
          if (entry.organizationId === organizationId && erased.has(entry.taskId)) {
            activity.delete(id);
          }
        }
        for (const row of inOrganization(organizationId)) {
          if (erased.has(row.id)) {
            tasks.delete(row.id);
          } else if (row.parentId !== null && erased.has(row.parentId)) {
            // Detached without a new version, as the statement does.
            tasks.set(row.id, { ...row, parentId: null, parentKey: null });
          }
        }
        for (const entryId of entryIds) {
          if (entries.get(entryId)?.organizationId === organizationId) {
            entries.delete(entryId);
          }
        }
        return Promise.resolve();
      },
      remove: (organizationId: string, entryId: string): Promise<void> => {
        this.trace.push('trash.remove');
        if (entries.get(entryId)?.organizationId !== organizationId) {
          return Promise.reject(new Error(`The trash entry ${entryId} vanished.`));
        }
        entries.delete(entryId);
        return Promise.resolve();
      },
    };
    return {
      archives,
      trash,
      dependencies: this.dependencies,
      copies: {
        listSources: (organizationId: string, listId: string, limit: number): Promise<readonly Task[]> => {
          this.trace.push('copies.listSources');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => row.listId === listId && isLiveState(row))
              .sort(byCreation)
              .slice(0, limit)
              .map((state: TaskState): Task => Task.restore(state)),
          );
        },
        insertChecklist: (task: Task, source: readonly ChecklistItemState[]): Promise<Task> => {
          this.trace.push('copies.insertChecklist');
          const state: TaskState = {
            ...task.snapshot,
            checklist: source.map((item: ChecklistItemState, index: number): ChecklistItemState => ({
              ...item,
              id: this.nextId('019a7300'),
              position: index + 1,
            })),
          };
          tasks.set(state.id, state);
          return Promise.resolve(Task.restore(state));
        },
      },
      jobs: {
        dropTrashedTaskRequests: (entryId: string, taskIds: readonly string[]): Promise<void> => {
          this.trace.push('jobs.dropTrashedTaskRequests');
          // The occurrence key `entry:<entryId>` makes a second enqueue a no-op.
          if (
            !jobs.some(
              (job: RecordedJob): boolean =>
                job.queue === 'task.drop-trashed-task-requests' && job.entryId === entryId,
            )
          ) {
            jobs.push({ queue: 'task.drop-trashed-task-requests', entryId, taskIds: [...taskIds] });
          }
          return Promise.resolve();
        },
        purgeTrash: (): Promise<void> => {
          this.trace.push('jobs.purgeTrash');
          jobs.push({ queue: 'task.purge-trash' });
          return Promise.resolve();
        },
      },
      tasks: {
        findByKey: (organizationId: string, key: TaskKey, lock: boolean): Promise<Task | null> => {
          this.trace.push(lock ? 'tasks.findByKey:lock' : 'tasks.findByKey:read');
          const state: TaskState | undefined = inOrganization(organizationId).find(
            (row: TaskState): boolean => row.key.equals(key),
          );
          return Promise.resolve(state === undefined ? null : Task.restore(state));
        },
        lockByIds: (
          organizationId: string,
          ids: readonly string[],
          withChecklists: boolean = true,
        ): Promise<readonly Task[]> => {
          this.trace.push('tasks.lockByIds');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => ids.includes(row.id))
              .sort((left: TaskState, right: TaskState): number => left.id.localeCompare(right.id))
              .map((row: TaskState): Task =>
                Task.restore(withChecklists ? row : { ...row, checklist: [] }),
              ),
          );
        },
        lockStanding: (organizationId: string, taskId: string): Promise<TaskStanding | null> => {
          this.trace.push('tasks.lockStanding');
          const row: TaskState | undefined = inOrganization(organizationId).find(
            (candidate: TaskState): boolean => candidate.id === taskId,
          );
          return Promise.resolve(
            row === undefined
              ? null
              : { live: isLiveState(row), inTrash: row.trash !== null, listId: row.listId },
          );
        },
        insert: (draft: TaskDraft, key: TaskKey): Promise<Task> => {
          this.trace.push('tasks.insert');
          return Promise.resolve(Task.restore(insertDraft(draft, key)));
        },
        insertMany: (
          drafts: readonly TaskDraft[],
          keys: readonly TaskKey[],
        ): Promise<readonly Task[]> => {
          this.trace.push('tasks.insertMany');
          return Promise.resolve(
            drafts.map((draft: TaskDraft, index: number): Task => {
              const key: TaskKey | undefined = keys[index];
              if (key === undefined) {
                throw new Error('A draft has no key.');
              }
              return Task.restore(insertDraft(draft, key));
            }),
          );
        },
        save: (before: Task, after: Task): Promise<void> => {
          this.trace.push('tasks.save');
          if (tasks.get(before.snapshot.id)?.version !== before.snapshot.version) {
            return Promise.reject(new Error('The task changed since it was read.'));
          }
          tasks.set(after.snapshot.id, after.snapshot);
          return Promise.resolve();
        },
        insertChecklistItem: (
          _organizationId: string,
          _taskId: string,
          draft: ChecklistItemDraft,
        ): Promise<ChecklistItemState> =>
          Promise.resolve({ ...draft, id: this.nextId('019a7300') }),
        levelOf: (organizationId: string, taskId: string): Promise<number> => {
          let level: number = 1;
          let parentId: string | null = tasks.get(taskId)?.parentId ?? null;
          while (parentId !== null) {
            level += 1;
            parentId =
              inOrganization(organizationId).find((row) => row.id === parentId)?.parentId ?? null;
          }
          return Promise.resolve(level);
        },
        subtreeOf: (organizationId: string, taskId: string): Promise<SubtreeShape> => {
          const descendantIds: string[] = [];
          let height: number = 1;
          let level: readonly string[] = [taskId];
          while (level.length > 0) {
            const next: string[] = level.flatMap((id: string): string[] =>
              liveChildrenOf(organizationId, id).map((row: TaskState): string => row.id),
            );
            if (next.length > 0) {
              height += 1;
              descendantIds.push(...next);
            }
            level = next;
          }
          return Promise.resolve({ taskId, descendantIds, height });
        },
        childCount: (organizationId: string, parentId: string): Promise<number> =>
          Promise.resolve(liveChildrenOf(organizationId, parentId).length),
        lockArchive: (organizationId: string, rootId: string): Promise<readonly Task[]> => {
          this.trace.push('tasks.lockArchive');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => archiveOf(row) === rootId)
              .sort((left: TaskState, right: TaskState): number => left.id.localeCompare(right.id))
              // The members are locked without their checklists, as the statement loads them.
              .map((row: TaskState): Task => Task.restore({ ...row, checklist: [] })),
          );
        },
        writeArchives: (
          _organizationId: string,
          rootId: string,
          updated: readonly Task[],
        ): Promise<void> => {
          this.trace.push('tasks.writeArchives');
          for (const task of updated) {
            if (tasks.get(task.snapshot.id)?.version !== task.snapshot.version - 1) {
              return Promise.reject(
                new Error(`A task of the archive of ${rootId} changed since it was locked.`),
              );
            }
          }
          for (const task of updated) {
            // The statement writes neither the checklist nor the collections, which the rows keep.
            tasks.set(task.snapshot.id, {
              ...task.snapshot,
              checklist: tasks.get(task.snapshot.id)?.checklist ?? [],
            });
          }
          return Promise.resolve();
        },
        lockAssignedTo: (
          organizationId: string,
          userId: string,
          afterId: string | null,
          limit: number,
        ): Promise<readonly Task[]> => {
          this.trace.push('tasks.lockAssignedTo');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter(
                (row: TaskState): boolean =>
                  row.assigneeIds.includes(userId) && (afterId === null || row.id > afterId),
              )
              .sort((left: TaskState, right: TaskState): number => left.id.localeCompare(right.id))
              .slice(0, limit)
              .map((row: TaskState): Task => Task.restore({ ...row, checklist: [] })),
          );
        },
        unassignBatch: (
          _organizationId: string,
          _userId: string,
          updated: readonly Task[],
        ): Promise<void> => {
          this.trace.push('tasks.unassignBatch');
          for (const task of updated) {
            // The batch is written without its checklist, which the rows keep.
            tasks.set(task.snapshot.id, {
              ...task.snapshot,
              checklist: tasks.get(task.snapshot.id)?.checklist ?? [],
            });
          }
          return Promise.resolve();
        },
        lockTrashEntries: (
          organizationId: string,
          entryIds: readonly string[],
          forErasure: boolean,
        ): Promise<readonly Task[]> => {
          this.trace.push(forErasure ? 'tasks.lockTrashEntries:update' : 'tasks.lockTrashEntries');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter(
                (row: TaskState): boolean =>
                  row.trash !== null && entryIds.includes(row.trash.entryId),
              )
              .sort((left: TaskState, right: TaskState): number => left.id.localeCompare(right.id))
              // The tasks are locked without their checklists, as the statement loads them.
              .map((row: TaskState): Task => Task.restore({ ...row, checklist: [] })),
          );
        },
        writeTrash: (
          _organizationId: string,
          entryIds: readonly string[],
          writes: readonly TrashTaskWrite[],
        ): Promise<void> => {
          this.trace.push('tasks.writeTrash');
          for (const { task, versionBefore } of writes) {
            // Guarded by the version under the lock, as the statement is.
            if (tasks.get(task.snapshot.id)?.version !== versionBefore) {
              return Promise.reject(
                new Error(
                  `A task of the trash entries ${entryIds.join(', ')} changed since it was locked.`,
                ),
              );
            }
          }
          for (const { task } of writes) {
            // The statement writes neither the checklist nor the collections, which the rows keep.
            tasks.set(task.snapshot.id, {
              ...task.snapshot,
              checklist: tasks.get(task.snapshot.id)?.checklist ?? [],
            });
          }
          return Promise.resolve();
        },
        trashCandidates: (
          organizationId: string,
          listId: string,
          after: PagePosition | null,
          limit: number,
        ): Promise<readonly TrashCandidateRoot[]> => {
          this.trace.push('tasks.trashCandidates');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter(
                (row: TaskState): boolean =>
                  row.listId === listId &&
                  row.trash === null &&
                  readsTopLevel(row) &&
                  (after === null || byCreation(row, after) > 0),
              )
              .sort(byCreation)
              .slice(0, limit)
              .map((row: TaskState): TrashCandidateRoot => ({
                id: row.id,
                createdAt: row.createdAt,
              })),
          );
        },
        trashTrees: (
          organizationId: string,
          rootIds: readonly string[],
          readLimit?: number,
        ): Promise<readonly TrashTreeNode[]> => {
          this.trace.push('tasks.trashTrees');
          const nodes: TrashTreeNode[] = [];
          for (const root of inOrganization(organizationId)) {
            if (!rootIds.includes(root.id) || root.trash !== null) {
              continue;
            }
            // Every descendant in the list of the root out of the trash, live or archived.
            let level: readonly TaskState[] = [root];
            for (let depth: number = 0; level.length > 0; depth += 1) {
              nodes.push(
                ...level.map((row: TaskState): TrashTreeNode => ({
                  id: row.id,
                  rootId: root.id,
                  depth,
                })),
              );
              const parentIds: readonly string[] = level.map((row: TaskState): string => row.id);
              level = inOrganization(organizationId).filter(
                (row: TaskState): boolean =>
                  row.parentId !== null &&
                  parentIds.includes(row.parentId) &&
                  row.listId === root.listId &&
                  row.trash === null,
              );
            }
          }
          return Promise.resolve(
            nodes.sort(
              (left: TrashTreeNode, right: TrashTreeNode): number =>
                compareText(left.rootId, right.rootId) ||
                left.depth - right.depth ||
                compareText(left.id, right.id),
            ).slice(0, readLimit),
          );
        },
        lockUntrashedIds: (
          organizationId: string,
          taskIds: readonly string[],
        ): Promise<readonly string[]> => {
          // Every task of the ids is locked `FOR SHARE`, in the trash or not; those out answer.
          this.trace.push('tasks.lockUntrashedIds:share');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => taskIds.includes(row.id))
              .sort((left: TaskState, right: TaskState): number => compareText(left.id, right.id))
              .filter((row: TaskState): boolean => row.trash === null)
              .map((row: TaskState): string => row.id),
          );
        },
        listsWithTasks: (
          organizationId: string,
          listIds: readonly string[],
        ): Promise<ReadonlySet<string>> => {
          this.trace.push('tasks.listsWithTasks');
          return Promise.resolve(
            new Set(
              inOrganization(organizationId)
                .map((row: TaskState): string => row.listId)
                .filter((listId: string): boolean => listIds.includes(listId)),
            ),
          );
        },
        listsWithUntrashedTasks: (
          organizationId: string,
          listIds: readonly string[],
        ): Promise<ReadonlySet<string>> => {
          this.trace.push('tasks.listsWithUntrashedTasks');
          return Promise.resolve(
            new Set(
              inOrganization(organizationId)
                .filter((row: TaskState): boolean => row.trash === null)
                .map((row: TaskState): string => row.listId)
                .filter((listId: string): boolean => listIds.includes(listId)),
            ),
          );
        },
        shareLocationUnlessLocked: (
          organizationId: string,
          key: TaskKey,
        ): Promise<TaskLocation | null> => {
          // The task of the key is locked `FOR SHARE SKIP LOCKED` whatever it is; one in the trash,
          // or one a writer holds, answers null.
          this.trace.push('tasks.shareLocationUnlessLocked:share');
          const row: TaskState | undefined = inOrganization(organizationId).find(
            (candidate: TaskState): boolean => candidate.key.equals(key),
          );
          return Promise.resolve(
            row?.trash !== null || this.heldByWriter.has(row.id) ? null : locationOf(row),
          );
        },
      },
      reader: {
        subtaskCounts: (
          organizationId: string,
          taskIds: readonly string[],
        ): Promise<ReadonlyMap<string, SubtaskCounts>> =>
          Promise.resolve(
            new Map(
              taskIds.map((id: string): [string, SubtaskCounts] => [
                id,
                countsOf(organizationId, id),
              ]),
            ),
          ),
        childrenOf: (
          organizationId: string,
          parentId: string,
          after: PagePosition | null,
          limit: number,
        ): Promise<readonly TaskSummaryView[]> =>
          Promise.resolve(
            childrenOf(organizationId, parentId)
              .filter(
                (row: TaskState): boolean =>
                  after === null ||
                  row.createdAt.getTime() > after.createdAt.getTime() ||
                  (row.createdAt.getTime() === after.createdAt.getTime() && row.id > after.id),
              )
              .slice(0, limit)
              .map((row: TaskState): TaskSummaryView =>
                summaryOf(row, countsOf(organizationId, row.id), parentKeyShown(row)),
              ),
          ),
        countChildren: (organizationId: string, parentId: string): Promise<number> =>
          Promise.resolve(childrenOf(organizationId, parentId).length),
        references: (
          organizationId: string,
          taskIds: readonly string[],
        ): Promise<ReadonlyMap<string, TaskReferenceInListView>> =>
          Promise.resolve(
            new Map(
              inOrganization(organizationId)
                .filter((row: TaskState): boolean => taskIds.includes(row.id))
                .map((row: TaskState): [string, TaskReferenceInListView] => [
                  row.id,
                  {
                    key: row.key.format(),
                    name: row.name,
                    status: row.status,
                    listId: row.listId,
                    inTrash: row.trash !== null,
                  },
                ]),
            ),
          ),
        locationByKey: (organizationId: string, key: TaskKey): Promise<TaskLocation | null> => {
          this.trace.push('reader.locationByKey');
          // A task in the trash is left out (`trash_entry_id is null`).
          const row: TaskState | undefined = inOrganization(organizationId).find(
            (candidate: TaskState): boolean =>
              candidate.key.equals(key) && candidate.trash === null,
          );
          return Promise.resolve(row === undefined ? null : locationOf(row));
        },
        locationsByIds: (
          organizationId: string,
          taskIds: readonly string[],
        ): Promise<readonly TaskLocation[]> => {
          this.trace.push('reader.locationsByIds');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => taskIds.includes(row.id) && row.trash === null)
              .map(locationOf),
          );
        },
      },
      activity: {
        latestOfKind: (
          organizationId: string,
          taskId: string,
          kind: ActivityKind,
        ): Promise<ActivityEntryState | null> =>
          Promise.resolve(
            recent(
              [...activity.values()].filter(
                (entry: ActivityEntryState): boolean =>
                  entry.organizationId === organizationId &&
                  entry.taskId === taskId &&
                  entry.change.kind === kind,
              ),
              null,
            )[0] ?? null,
          ),
        insert: (drafts: readonly ActivityEntryDraft[]): Promise<void> => {
          for (const draft of drafts) {
            const entry: ActivityEntryState = { ...draft, id: this.nextId('019a7400') };
            activity.set(entry.id, entry);
          }
          return Promise.resolve();
        },
        update: (entry: ActivityEntryState): Promise<void> => {
          activity.set(entry.id, entry);
          return Promise.resolve();
        },
        remove: (_organizationId: string, entryId: string): Promise<void> => {
          activity.delete(entryId);
          return Promise.resolve();
        },
        pageOfTask: (
          organizationId: string,
          taskId: string,
          kinds: readonly ActivityKind[] | null,
          after: ActivityPosition | null,
          limit: number,
        ): Promise<readonly ActivityEntryState[]> =>
          Promise.resolve(
            recent(
              [...activity.values()].filter(
                (entry: ActivityEntryState): boolean =>
                  entry.organizationId === organizationId &&
                  entry.taskId === taskId &&
                  matchesKinds(entry, kinds),
              ),
              after,
            ).slice(0, limit),
          ),
        countOfTask: (
          organizationId: string,
          taskId: string,
          kinds: readonly ActivityKind[] | null,
        ): Promise<number> =>
          Promise.resolve(
            [...activity.values()].filter(
              (entry: ActivityEntryState): boolean =>
                entry.organizationId === organizationId &&
                entry.taskId === taskId &&
                matchesKinds(entry, kinds),
            ).length,
          ),
        pageOfList: (
          organizationId: string,
          filter: ListActivityFilter,
          after: ActivityPosition | null,
          limit: number,
        ): Promise<readonly ActivityEntryState[]> =>
          Promise.resolve(recent(inList(organizationId, filter), after).slice(0, limit)),
        countOfList: (organizationId: string, filter: ListActivityFilter): Promise<number> =>
          Promise.resolve(inList(organizationId, filter).length),
      },
      queries: reads,
      counter: reads,
      assigned: reads,
      labels: reads,
      events: {
        dependencyChanged: (
          action: 'added' | 'removed',
          dependencyId: string,
          blocker: Task,
          blocked: Task,
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'dependencyChanged',
            action,
            dependencyId,
            key: blocker.snapshot.key.format(),
            version: blocker.snapshot.version,
            blockedKey: blocked.snapshot.key.format(),
            blockedVersion: blocked.snapshot.version,
            actor,
          });
          return Promise.resolve();
        },
        taskCreated: (task: Task, actor: EventActor): Promise<void> => {
          this.trace.push('events.created');
          events.push({
            kind: 'created',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            actor,
          });
          return Promise.resolve();
        },
        taskUpdated: (
          task: Task,
          changed: readonly TaskField[],
          actor: EventActor,
        ): Promise<void> => {
          this.trace.push('events.updated');
          events.push({
            kind: 'updated',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            changed,
            actor,
          });
          return Promise.resolve();
        },
        taskStatusChanged: (
          task: Task,
          previousStatus: StatusKey,
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'statusChanged',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            previousStatus,
            actor,
          });
          return Promise.resolve();
        },
        taskAssigned: (task: Task, assigneeId: string, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'assigned',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            assigneeId,
            actor,
          });
          return Promise.resolve();
        },
        taskArchived: (task: Task, rootKey: TaskKey, actor: EventActor): Promise<void> => {
          this.trace.push('events.archived');
          events.push({
            kind: 'archived',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            rootKey: rootKey.format(),
            parentKey: task.snapshot.parentKey?.format() ?? null,
            actor,
          });
          return Promise.resolve();
        },
        taskUnarchived: (task: Task, rootKey: TaskKey, actor: EventActor): Promise<void> => {
          this.trace.push('events.unarchived');
          events.push({
            kind: 'unarchived',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            rootKey: rootKey.format(),
            parentKey: task.snapshot.parentKey?.format() ?? null,
            actor,
          });
          return Promise.resolve();
        },
        taskTrashed: (
          task: Task,
          entryId: string,
          rootKey: TaskKey,
          purgeAt: Date,
          actor: EventActor,
        ): Promise<void> => {
          this.trace.push('events.trashed');
          events.push({
            kind: 'trashed',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            entryId,
            rootKey: rootKey.format(),
            parentKey: task.snapshot.parentKey?.format() ?? null,
            purgeAt,
            actor,
          });
          return Promise.resolve();
        },
        taskRestored: (
          task: Task,
          entryId: string,
          rootKey: TaskKey,
          actor: EventActor,
        ): Promise<void> => {
          this.trace.push('events.restored');
          events.push({
            kind: 'restored',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            entryId,
            rootKey: rootKey.format(),
            parentKey: task.snapshot.parentKey?.format() ?? null,
            purgeAt: null,
            actor,
          });
          return Promise.resolve();
        },
        taskPurged: (
          task: Task,
          entryId: string,
          rootKey: TaskKey,
          actor: EventActor,
        ): Promise<void> => {
          this.trace.push('events.purged');
          events.push({
            kind: 'purged',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            entryId,
            rootKey: rootKey.format(),
            parentKey: task.snapshot.parentKey?.format() ?? null,
            purgeAt: null,
            actor,
          });
          return Promise.resolve();
        },
        milestoneReached: (task, watcherIds, actor): Promise<void> => {
          events.push({
            kind: 'milestoneReached',
            key: task.snapshot.key.format(),
            version: task.snapshot.version,
            watcherIds,
            actor,
          });
          return Promise.resolve();
        },
        taskOccurrenceCreated: (predecessor, successor, cadence, actor): Promise<void> => {
          events.push({
            kind: 'occurrenceCreated',
            key: predecessor.snapshot.key.format(),
            version: predecessor.snapshot.version,
            successorKey: successor.snapshot.key.format(),
            cadence,
            actor,
          });
          return Promise.resolve();
        },
      },
      clock: { now: (): Promise<Date> => Promise.resolve(this.now) },
    };
  }

  /**
   * Method nextId
   *
   * @description
   * Gives the next id of a row the fake inserts.
   *
   * @param {string} group - The first group of the id, which tells tasks, items and entries apart.
   * @returns {string} The id.
   */
  private nextId(group: string): string {
    this.sequence += 1;
    return `${group}-0000-7000-8000-${String(this.sequence).padStart(12, '0')}`;
  }
  // #endregion
}

/**
 * Waits for work that must be refused and returns the refusal.
 *
 * @param work - The pending work.
 * @returns The reason of the refusal.
 * @throws {Error} When the work resolves or rejects with something else than a `TaskRefusal`.
 */
export async function refusalOf(work: Promise<unknown>): Promise<TaskRefusalReason> {
  try {
    await work;
  } catch (error: unknown) {
    if (error instanceof TaskRefusal) {
      return error.refusal;
    }
    throw error;
  }
  throw new Error('The work was expected to be refused.');
}
