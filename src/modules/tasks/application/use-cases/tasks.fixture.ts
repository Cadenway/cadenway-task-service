import { Task } from '../../domain/aggregates/task/task.aggregate.js';
import {
  ALL_STATUSES,
  ATELIER_NORD,
  BUGS,
  CAMILLE,
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
import type { SubtreeShape } from '../../domain/value-objects/subtask/subtree-shape.value-object.js';
import type { ChecklistItemDraft } from '../../domain/value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../domain/value-objects/task/checklist-item-state.value-object.js';
import type { StatusKey } from '../../domain/value-objects/task/status-key.value-object.js';
import type { TaskDraft } from '../../domain/value-objects/task/task-draft.value-object.js';
import type { TaskField } from '../../domain/value-objects/task/task-field.value-object.js';
import type { TaskKey } from '../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../domain/value-objects/task/task-state.value-object.js';
import type { EventActor } from '../models/actor/event-actor.model.js';
import type { ActivityPosition } from '../models/activity/activity-position.model.js';
import type { ListActivityFilter } from '../models/activity/list-activity-filter.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { KeyAllocation } from '../models/placement/key-allocation.model.js';
import type { ListPlacement } from '../models/placement/list-placement.model.js';
import type { PlacedList } from '../models/placement/placed-list.model.js';
import type { PlacedSpace } from '../models/placement/placed-space.model.js';
import { TaskRefusal } from '../models/task/task-refusal.model.js';
import type { TaskRefusalReason } from '../models/task/task-refusal-reason.model.js';
import type { TasksStore } from '../models/transactions/tasks-store.model.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../ports/outbound/spaces/space/space-directory.port.js';
import type { TasksUnitOfWork } from '../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import type { SubtaskCounts } from '../projections/task/subtask-counts.projection.js';
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
    ...overrides,
  };
}

/** What a spec seeds in the fake spaces. */
export interface InMemorySpaceSeed {
  // #region Properties
  /** The spaces; the usual ones (Produit, Design, Archives) when left out. */
  readonly spaces?: readonly PlacedSpace[];

  /** The lists; the usual ones (Sprint 14, Bugs, Maquettes, Clôturés) when left out. */
  readonly lists?: readonly PlacedList[];

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
 * A fake `SpaceDirectory` over spaces and lists of Atelier Nord, with the visibility rules of the
 * spaces module: a guest sees nothing, a private space is seen by its owner only.
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

  /** The last number given for each prefix. */
  public readonly lastNumbers: Map<string, number>;

  /** The spaces by id. */
  private readonly spaces: ReadonlyMap<string, PlacedSpace>;

  /** The lists by id. */
  private readonly lists: ReadonlyMap<string, PlacedList>;

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
    const lists: readonly PlacedList[] = seed.lists ?? [
      placedList(),
      placedList({ id: BUGS, name: 'Bugs', sprint: null }),
      placedList({ id: MAQUETTES, spaceId: DESIGN, name: 'Maquettes', sprint: null }),
      placedList({ id: CLOTURES, spaceId: ARCHIVES, name: 'Clôturés', sprint: null }),
    ];
    this.spaces = new Map(
      spaces.map((space: PlacedSpace): [string, PlacedSpace] => [space.id, space]),
    );
    this.lists = new Map(lists.map((list: PlacedList): [string, PlacedList] => [list.id, list]));
    this.lastNumbers = new Map(Object.entries(seed.lastNumbers ?? { CAD: 495 }));
    this.trace = seed.trace ?? [];
  }
  // #endregion

  // #region Methods
  /**
   * Method findVisibleList
   *
   * @description
   * Finds a list of Atelier Nord in a space the viewer sees.
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
    if (
      organizationId !== ATELIER_NORD ||
      list === undefined ||
      space === undefined ||
      !this.sees(viewer, space)
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve({ list, space });
  }

  /**
   * Method visibleSpaceIds
   *
   * @description
   * Lists the spaces the viewer sees.
   *
   * @param {string} organizationId - The organization.
   * @param {Viewer} viewer - The acting member.
   * @returns {Promise<readonly string[]>} Their ids.
   */
  public visibleSpaceIds(organizationId: string, viewer: Viewer): Promise<readonly string[]> {
    this.trace.push('spaces.visibleSpaceIds');
    return Promise.resolve(
      organizationId !== ATELIER_NORD
        ? []
        : [...this.spaces.values()]
            .filter((space: PlacedSpace): boolean => this.sees(viewer, space))
            .map((space: PlacedSpace): string => space.id),
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
   * Method sees
   *
   * @description
   * Applies the visibility rule of the spaces module.
   *
   * @param {Viewer} viewer - The acting member.
   * @param {PlacedSpace} space - The space.
   * @returns {boolean} Whether the viewer sees the space.
   */
  private sees(viewer: Viewer, space: PlacedSpace): boolean {
    if (viewer.role === 'guest') {
      return false;
    }
    return space.visibility === 'organization' || space.ownerUserId === viewer.userId;
  }
  // #endregion
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
    const inList = (organizationId: string, filter: ListActivityFilter): ActivityEntryState[] =>
      [...activity.values()].filter((entry: ActivityEntryState): boolean => {
        const task: TaskState | undefined = tasks.get(entry.taskId);
        return (
          entry.organizationId === organizationId &&
          entry.listId === filter.listId &&
          task !== undefined &&
          filter.spaceIds.includes(task.spaceId) &&
          matchesKinds(entry, filter.kinds) &&
          (filter.actorIds === null || filter.actorIds.includes(entry.actor.id))
        );
      });
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
          return Promise.resolve(Task.restore(state));
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
              .map((row: TaskState): Task => Task.restore(row)),
          );
        },
        unassignBatch: (
          _organizationId: string,
          _userId: string,
          updated: readonly Task[],
        ): Promise<void> => {
          this.trace.push('tasks.unassignBatch');
          for (const task of updated) {
            tasks.set(task.snapshot.id, task.snapshot);
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
