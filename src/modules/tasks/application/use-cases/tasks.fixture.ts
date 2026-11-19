import { Task } from '../../domain/aggregates/task/task.aggregate.js';
import {
  ALL_STATUSES,
  ATELIER_NORD,
  BUGS,
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
  taskState,
} from '../../domain/tasks.fixture.js';
import type { ActivityEntryDraft } from '../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityKind } from '../../domain/value-objects/activity/activity-kind.value-object.js';
import type { MemberRole } from '../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../domain/value-objects/member/viewer.value-object.js';
import { isLate } from '../../domain/policies/task/lateness.policy.js';
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
import type { TaskState } from '../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../models/actor/event-actor.model.js';
import type { ActivityPosition } from '../models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../models/activity/list-activity-filter.model.js';
import type { LabelPosition } from '../models/label/label-position.model.js';
import type { ListedLabel } from '../models/label/listed-label.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { ListedTask } from '../models/query/listed-task.model.js';
import { SORT_KEY_PREFIX_LENGTH } from '../models/query/sort-key-prefix-length.model.js';
import type { TaskFilter } from '../models/query/task-filter.model.js';
import type { TaskGrouping } from '../models/query/task-grouping.model.js';
import type { TaskOrder } from '../models/query/task-order.model.js';
import type { TaskPosition } from '../models/query/task-position.model.js';
import type { MyTaskState } from '../models/user/my-task-state.model.js';
import type { KeyAllocation } from '../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../models/placement/list-placement.model.js';
import type { AccessRole } from '../models/placement/access-role.model.js';
import type { PlacedList } from '../models/placement/placed-list.model.js';
import type { PlacedSpace } from '../models/placement/placed-space.model.js';
import { TaskRefusal } from '../models/task/task-refusal.model.js';
import type { TaskRefusalReason } from '../models/task/task-refusal-reason.model.js';
import type { ReadOptions } from '../models/transactions/read-options.model.js';
import type { TasksStore } from '../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { AssignedTaskReader } from '../ports/outbound/persistence/assignee/assigned-task-reader.port.js';
import type { TaskCounter } from '../ports/outbound/persistence/count/task-counter.port.js';
import type { LabelReader } from '../ports/outbound/persistence/label/label-reader.port.js';
import type { TaskQueryReader } from '../ports/outbound/persistence/query/task-query-reader.port.js';
import type { SpaceDirectory } from '../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { TaskCountsView } from '../projections/count/task-counts.projection.js';
import type { TaskGroupCountsView } from '../projections/query/task-group-counts.projection.js';
import type { TaskGroupView } from '../projections/query/task-group.projection.js';
import type { HomeStatsView } from '../projections/user/home-stats.projection.js';
import type { MyTaskCountsView } from '../projections/user/my-task-counts.projection.js';
import type { SubtaskCounts } from '../projections/task/subtask-counts.projection.js';
import type { TaskLocation } from '../projections/task/task-location.projection.js';
import type { TaskReferenceView } from '../projections/task/task-reference.projection.js';
import type { TaskSummaryView } from '../projections/task/task-summary.projection.js';

export {
  ALL_STATUSES,
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_483,
  CAD_484,
  CAD_490,
  CAMILLE,
  CAMILLE_ACTOR,
  CREATED_AT,
  DESIGN,
  HUGO,
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
  UPDATED_AT,
  cad490State,
  priorityEntry,
  statusesHiding,
  subtaskState,
  taskState,
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
    };

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
 * Builds the list "Sprint 14" of the space "Produit".
 *
 * @param overrides - Fields to replace.
 * @returns The list.
 */
export function placedList(overrides: Partial<PlacedList> = {}): PlacedList {
  return {
    id: SPRINT_14,
    spaceId: PRODUIT,
    name: 'Sprint 14',
    icon: null,
    color: 'bleu',
    sprint: { startDate: '2026-11-02', endDate: '2026-11-15', goal: 'Livrer le SSO' },
    createdAt: new Date('2026-10-26T09:00:00Z'),
    version: 1,
    organizationAccess: true,
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
  // #endregion
}

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
 * those of their private space: the rules before grants.
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

  /** The lists by id. */
  private readonly lists: ReadonlyMap<string, PlacedList>;

  /** The grants of the spaces, by space id then account. */
  private readonly spaceGrants: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The grants of the lists, by list id then account. */
  private readonly listGrants: Readonly<Record<string, Readonly<Record<string, AccessRole>>>>;

  /** The calls of every fake, in order. */
  private readonly trace: string[];
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
  public visibleListIds(organizationId: string, viewer: Viewer): Promise<readonly string[]> {
    this.trace.push('spaces.visibleListIds');
    return Promise.resolve(
      this.visibleLists(organizationId, viewer).map((list: PlacedList): string => list.id),
    );
  }

  /**
   * Method findVisibleSpaceLists
   *
   * @description
   * Lists the lists of a space of Atelier Nord the viewer sees that they have a role on, with that
   * role, in the order of their creation.
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
    if (organizationId !== ATELIER_NORD || space === undefined || !this.seesSpace(viewer, space)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.placedListsOf(viewer, space));
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
            list.sprint !== null && list.sprint.startDate <= today && today <= list.sprint.endDate,
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
    return Promise.resolve(this.visibleLists(organizationId, viewer).slice(0, limit));
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
   * Lists the lists of a space the viewer has a role on, by creation, each with that role.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {PlacedList[]} The lists.
   */
  private placedListsOf(viewer: Viewer, space: PlacedSpace): PlacedList[] {
    return [...this.lists.values()]
      .filter((list: PlacedList): boolean => list.spaceId === space.id)
      .sort(byCreation)
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
    const space: PlacedSpace | undefined = this.spaces.get(list.spaceId);
    const role: AccessRole | null =
      space === undefined ? null : this.listRoleOf(viewer, space, list);
    return role === null ? null : { ...list, callerRole: role };
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

/** What a spec seeds in the fake store. */
export interface InMemoryTasksSeed {
  // #region Properties
  /** The tasks already stored. */
  readonly tasks?: readonly TaskState[];

  /** The activity entries already stored. */
  readonly activity?: readonly ActivityEntryState[];

  /** The instant of the transaction. */
  readonly now?: Date;

  /** The calls of every fake, in order. */
  readonly trace?: string[];
  // #endregion
}

/**
 * Builds the summary row of a task as a reader gives it.
 *
 * @param state - The task.
 * @param subtaskCounts - Its direct subtasks.
 * @returns The summary.
 */
export function summaryOf(state: TaskState, subtaskCounts: SubtaskCounts): TaskSummaryView {
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
    labels: state.labels,
    parentKey: state.parentKey === null ? null : state.parentKey.format(),
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
 * organization as the repositories are. It applies the filters, the closed and late rules and the
 * orders of the contract just enough for a use case to show its orchestration; the exact SQL
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
      if (state.organizationId !== organizationId || !listIds.includes(state.listId)) {
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
      if (state.organizationId !== organizationId || state.listId !== listId) {
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
 * instant fixed.
 */
export class InMemoryTasks implements TasksUnitOfWork {
  // #region Properties
  /** The committed tasks by id. */
  public tasks: Map<string, TaskState>;

  /** The committed activity entries by id, in insertion order. */
  public activity: Map<string, ActivityEntryState>;

  /** The events of the committed work, in the order they were appended. */
  public events: RecordedEvent[] = [];

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
    const result: TResult = await work(this.store(tasks, activity, events));
    this.tasks = tasks;
    this.activity = activity;
    this.events = events;
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
   * @returns {TasksStore} The store.
   */
  private store(
    tasks: Map<string, TaskState>,
    activity: Map<string, ActivityEntryState>,
    events: RecordedEvent[],
  ): TasksStore {
    const inOrganization = (organizationId: string): TaskState[] =>
      [...tasks.values()].filter(
        (row: TaskState): boolean => row.organizationId === organizationId,
      );
    const childrenOf = (organizationId: string, parentId: string): TaskState[] =>
      inOrganization(organizationId)
        .filter((row: TaskState): boolean => row.parentId === parentId)
        .sort(
          (left: TaskState, right: TaskState): number =>
            left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
        );
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
      };
      tasks.set(state.id, state);
      return state;
    };
    const inList = (organizationId: string, filter: ListActivityFilter): ActivityEntryState[] =>
      [...activity.values()].filter((entry: ActivityEntryState): boolean => {
        const task: TaskState | undefined = tasks.get(entry.taskId);
        return (
          entry.organizationId === organizationId &&
          entry.listId === filter.listId &&
          task !== undefined &&
          filter.listIds.includes(task.listId) &&
          matchesKinds(entry, filter.kinds) &&
          (filter.actorIds === null || filter.actorIds.includes(entry.actor.id))
        );
      });
    const reads = new InMemoryTaskReads(
      (): readonly TaskState[] => [...tasks.values()],
      (state: TaskState): TaskSummaryView =>
        summaryOf(state, countsOf(state.organizationId, state.id)),
      this.reads,
      this.trace,
    );
    return {
      tasks: {
        findByKey: (organizationId: string, key: TaskKey, lock: boolean): Promise<Task | null> => {
          this.trace.push(lock ? 'tasks.findByKey:lock' : 'tasks.findByKey:read');
          const state: TaskState | undefined = inOrganization(organizationId).find(
            (row: TaskState): boolean => row.key.equals(key),
          );
          return Promise.resolve(state === undefined ? null : Task.restore(state));
        },
        lockByIds: (organizationId: string, ids: readonly string[]): Promise<readonly Task[]> => {
          this.trace.push('tasks.lockByIds');
          return Promise.resolve(
            inOrganization(organizationId)
              .filter((row: TaskState): boolean => ids.includes(row.id))
              .sort((left: TaskState, right: TaskState): number => left.id.localeCompare(right.id))
              .map((row: TaskState): Task => Task.restore(row)),
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
              childrenOf(organizationId, id).map((row: TaskState): string => row.id),
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
          Promise.resolve(childrenOf(organizationId, parentId).length),
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
                summaryOf(row, countsOf(organizationId, row.id)),
              ),
          ),
        countChildren: (organizationId: string, parentId: string): Promise<number> =>
          Promise.resolve(childrenOf(organizationId, parentId).length),
        references: (
          organizationId: string,
          taskIds: readonly string[],
        ): Promise<ReadonlyMap<string, TaskReferenceView>> =>
          Promise.resolve(
            new Map(
              inOrganization(organizationId)
                .filter((row: TaskState): boolean => taskIds.includes(row.id))
                .map((row: TaskState): [string, TaskReferenceView] => [
                  row.id,
                  { key: row.key.format(), name: row.name, status: row.status },
                ]),
            ),
          ),
        locationByKey: (organizationId: string, key: TaskKey): Promise<TaskLocation | null> => {
          this.trace.push('reader.locationByKey');
          const row: TaskState | undefined = inOrganization(organizationId).find(
            (candidate: TaskState): boolean => candidate.key.equals(key),
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
              .filter((row: TaskState): boolean => taskIds.includes(row.id))
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
