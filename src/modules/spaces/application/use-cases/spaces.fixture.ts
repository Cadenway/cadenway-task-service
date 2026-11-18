import { TaskList } from '../../domain/aggregates/list/task-list.aggregate.js';
import { Space } from '../../domain/aggregates/space/space.aggregate.js';
import type { TaskListDraft } from '../../domain/value-objects/list/task-list-draft.value-object.js';
import type { TaskListField } from '../../domain/value-objects/list/task-list-field.value-object.js';
import type { TaskListState } from '../../domain/value-objects/list/task-list-state.value-object.js';
import type { MemberRole } from '../../domain/value-objects/member/member-role.value-object.js';
import type { SpaceDraft } from '../../domain/value-objects/space/space-draft.value-object.js';
import type { SpaceField } from '../../domain/value-objects/space/space-field.value-object.js';
import type { SpaceState } from '../../domain/value-objects/space/space-state.value-object.js';
import type { EventActor } from '../models/actor/event-actor.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { SpacesStore } from '../models/transactions/spaces-store.model.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { SpacesUnitOfWork } from '../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  INES,
  LEA,
  MARKETING,
  NADIA,
  spaceState,
} from '../../domain/spaces.fixture.js';
import { SpaceRefusal } from '../models/space/space-refusal.model.js';
import type { SpaceRefusalReason } from '../models/space/space-refusal-reason.model.js';

export {
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  CREATED_AT,
  DESIGN,
  HUGO,
  INES,
  LEA,
  MARKETING,
  NADIA,
  PRODUIT,
  SPRINT_14,
  SPRINT_14_GOAL,
  backlogState,
  designState,
  spaceState,
  sprintState,
} from '../../domain/spaces.fixture.js';

/** Another organization than Atelier Nord. */
export const OTHER_ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/** A space id no space has. */
export const UNKNOWN_SPACE = '019a7000-0000-7000-8000-0000000000ff';

/** A list id no list has. */
export const UNKNOWN_LIST = '019a7100-0000-7000-8000-0000000000ff';

/** When the first space or list created by a spec gets its `createdAt`; each next one is a second later. */
const FIRST_CREATION: number = Date.parse('2026-11-18T10:00:00Z');

/**
 * Builds the stored state of the space "Marketing" (MKT), seen by the whole organization.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function marketingState(overrides: Partial<SpaceState> = {}): SpaceState {
  return spaceState({
    id: MARKETING,
    name: 'Marketing',
    prefix: 'MKT',
    icon: 'megaphone',
    color: 'orange',
    ownerUserId: INES,
    createdAt: new Date('2026-10-21T09:00:00Z'),
    ...overrides,
  });
}

/** An event the use cases appended to the outbox, as plain data. */
export type RecordedEvent =
  | {
      readonly kind: 'spaceCreated';
      readonly spaceId: string;
      readonly version: number;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'spaceUpdated';
      readonly spaceId: string;
      readonly version: number;
      readonly changed: readonly SpaceField[];
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listCreated';
      readonly listId: string;
      readonly spaceId: string;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listUpdated';
      readonly listId: string;
      readonly version: number;
      readonly changed: readonly TaskListField[];
      readonly actor: EventActor;
    };

/** What a spec seeds in the fake store. */
export interface InMemorySpacesSeed {
  // #region Properties
  /**
   * Property spaces
   *
   * @description
   * The spaces already stored; each one owns its current prefix.
   *
   * @type {readonly SpaceState[]}
   * @readonly
   */
  readonly spaces?: readonly SpaceState[];

  /**
   * Property lists
   *
   * @description
   * The lists already stored.
   *
   * @type {readonly TaskListState[]}
   * @readonly
   */
  readonly lists?: readonly TaskListState[];

  /**
   * Property formerPrefixes
   *
   * @description
   * Prefixes a space used before, which stay its own for good.
   *
   * @type {readonly { prefix: string; spaceId: string }[]}
   * @readonly
   */
  readonly formerPrefixes?: readonly { readonly prefix: string; readonly spaceId: string }[];

  /**
   * Property lastNumbers
   *
   * @description
   * The last task number given for a prefix of Atelier Nord; a prefix left out has none yet.
   *
   * @type {Readonly<Record<string, number>>}
   * @readonly
   */
  readonly lastNumbers?: Readonly<Record<string, number>>;
  // #endregion
}

/**
 * Class InMemoryMembers
 *
 * @description
 * A fake `MemberDirectory`: the roles of the copy of the members, by organization and account, and
 * the owner of each organization.
 */
export class InMemoryMembers implements MemberDirectory {
  // #region Properties
  /**
   * Property roleCalls
   *
   * @description
   * The `roleOf` calls, as organization, account and the `lock` flag as it was passed (`undefined` when left out).
   *
   * @type {{ organizationId: string; userId: string; lock: boolean | undefined }[]}
   * @readonly
   */
  public readonly roleCalls: {
    readonly organizationId: string;
    readonly userId: string;
    readonly lock: boolean | undefined;
  }[] = [];

  /**
   * Property ownerCalls
   *
   * @description
   * The organizations `ownerOf` was called with.
   *
   * @type {string[]}
   * @readonly
   */
  public readonly ownerCalls: string[] = [];

  /**
   * Property roles
   *
   * @description
   * The role of each account, by organization.
   *
   * @type {ReadonlyMap<string, ReadonlyMap<string, MemberRole>>}
   * @readonly
   */
  private readonly roles: ReadonlyMap<string, ReadonlyMap<string, MemberRole>>;

  /**
   * Property owners
   *
   * @description
   * The owner of each organization; an organization left out has none in the copy yet.
   *
   * @type {ReadonlyMap<string, string>}
   * @readonly
   */
  private readonly owners: ReadonlyMap<string, string>;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Builds the copy of one organization.
   *
   * @param {string} organizationId - The organization.
   * @param {Readonly<Record<string, MemberRole>>} roles - The role of each account of it.
   * @param {string | null} ownerUserId - Its owner, or `null` while the copy does not know it.
   * @constructor
   */
  public constructor(
    organizationId: string,
    roles: Readonly<Record<string, MemberRole>>,
    ownerUserId: string | null,
  ) {
    this.roles = new Map([[organizationId, new Map(Object.entries(roles))]]);
    this.owners = ownerUserId === null ? new Map() : new Map([[organizationId, ownerUserId]]);
  }
  // #endregion

  // #region Methods
  /**
   * Method roleOf
   *
   * @description
   * Returns the role of an account in an organization, or `null` when the copy does not know it.
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
    this.roleCalls.push({ organizationId, userId, lock });
    return Promise.resolve(this.roles.get(organizationId)?.get(userId) ?? null);
  }

  /**
   * Method ownerOf
   *
   * @description
   * Returns the owner of an organization, or `null` when the copy does not know it.
   *
   * @param {string} organizationId - The organization.
   * @returns {Promise<string | null>} The account of its owner.
   */
  public ownerOf(organizationId: string): Promise<string | null> {
    this.ownerCalls.push(organizationId);
    return Promise.resolve(this.owners.get(organizationId) ?? null);
  }
  // #endregion
}

/**
 * Class InMemorySpaces
 *
 * @description
 * A fake `SpacesUnitOfWork` holding the spaces, lists, prefixes and outbox in memory, with no
 * database: the work runs on a copy that is committed only when it resolves, as the tenant
 * transaction is, so a refusal leaves no row and no event. It scopes every read to the organization
 * as the repositories do, and records the calls the specs count.
 */
export class InMemorySpaces implements SpacesUnitOfWork {
  // #region Properties
  /**
   * Property spaces
   *
   * @description
   * The committed spaces by id, in insertion order.
   *
   * @type {Map<string, SpaceState>}
   */
  public spaces: Map<string, SpaceState>;

  /**
   * Property lists
   *
   * @description
   * The committed lists by id, in insertion order.
   *
   * @type {Map<string, TaskListState>}
   */
  public lists: Map<string, TaskListState>;

  /**
   * Property events
   *
   * @description
   * The events of the committed work, in the order they were appended.
   *
   * @type {RecordedEvent[]}
   */
  public events: RecordedEvent[] = [];

  /**
   * Property prefixOwners
   *
   * @description
   * The space that owns each prefix of Atelier Nord, current or former.
   *
   * @type {Map<string, string>}
   */
  public prefixOwners: Map<string, string>;

  /**
   * Property nextNumbersCalls
   *
   * @description
   * The prefixes of each `nextNumbers` call.
   *
   * @type {(readonly string[])[]}
   * @readonly
   */
  public readonly nextNumbersCalls: (readonly string[])[] = [];

  /**
   * Property listVisibleCalls
   *
   * @description
   * The arguments of each `listVisible` call.
   *
   * @type {{ organizationId: string; viewerUserId: string; after: PagePosition | null; limit: number }[]}
   * @readonly
   */
  public readonly listVisibleCalls: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly after: PagePosition | null;
    readonly limit: number;
  }[] = [];

  /**
   * Property listOfSpaceCalls
   *
   * @description
   * The arguments of each `listOfSpace` call.
   *
   * @type {{ spaceId: string; after: PagePosition | null; limit: number }[]}
   * @readonly
   */
  public readonly listOfSpaceCalls: {
    readonly spaceId: string;
    readonly after: PagePosition | null;
    readonly limit: number;
  }[] = [];

  /**
   * Property runs
   *
   * @description
   * How many units of work started, committed or not.
   *
   * @type {number}
   */
  public runs: number = 0;

  /**
   * Property lastNumbers
   *
   * @description
   * The last task number given for each prefix of Atelier Nord.
   *
   * @type {Map<string, number>}
   * @readonly
   */
  private readonly lastNumbers: Map<string, number>;

  /**
   * Property sequence
   *
   * @description
   * Counter of the ids and creation times the fake gives.
   *
   * @type {number}
   */
  private sequence: number = 0;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Starts with committed rows.
   *
   * @param {InMemorySpacesSeed} seed - What is already stored.
   * @constructor
   */
  public constructor(seed: InMemorySpacesSeed = {}) {
    this.spaces = new Map((seed.spaces ?? []).map((row: SpaceState) => [row.id, row]));
    this.lists = new Map((seed.lists ?? []).map((row: TaskListState) => [row.id, row]));
    this.prefixOwners = new Map(
      (seed.spaces ?? []).map((row: SpaceState): [string, string] => [
        InMemorySpaces.prefixKey(row.organizationId, row.prefix),
        row.id,
      ]),
    );
    for (const former of seed.formerPrefixes ?? []) {
      const space: SpaceState | undefined = this.spaces.get(former.spaceId);
      this.prefixOwners.set(
        InMemorySpaces.prefixKey(space?.organizationId ?? '', former.prefix),
        former.spaceId,
      );
    }
    this.lastNumbers = new Map(
      Object.entries(seed.lastNumbers ?? {}).map(([prefix, last]: [string, number]) => [
        InMemorySpaces.prefixKey(ATELIER_NORD, prefix),
        last,
      ]),
    );
  }
  // #endregion

  // #region Methods
  /**
   * Method prefixKey
   *
   * @description
   * The key of a prefix of an organization in the maps of the fake.
   *
   * @param {string} organizationId - The organization.
   * @param {string} prefix - The prefix.
   * @returns {string} The key.
   */
  private static prefixKey(organizationId: string, prefix: string): string {
    return `${organizationId}/${prefix}`;
  }

  /**
   * Method page
   *
   * @description
   * Sorts rows by creation time and id and keeps those after a position, as the keyset query does.
   *
   * @param {readonly TRow[]} rows - The rows.
   * @param {PagePosition | null} after - The last row of the previous page, or `null`.
   * @param {number} limit - How many rows at most.
   * @returns {TRow[]} The rows of the page.
   */
  private static page<TRow extends { readonly createdAt: Date; readonly id: string }>(
    rows: readonly TRow[],
    after: PagePosition | null,
    limit: number,
  ): TRow[] {
    return [...rows]
      .sort(
        (left: TRow, right: TRow): number =>
          left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
      )
      .filter(
        (row: TRow): boolean =>
          after === null ||
          row.createdAt.getTime() > after.createdAt.getTime() ||
          (row.createdAt.getTime() === after.createdAt.getTime() && row.id > after.id),
      )
      .slice(0, limit);
  }

  /**
   * Method run
   *
   * @description
   * Runs the work on a copy of the rows and of the outbox, committed when it resolves and dropped
   * when it rejects.
   *
   * @param {(store: SpacesStore) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(work: (store: SpacesStore) => Promise<TResult>): Promise<TResult> {
    this.runs += 1;
    const spaces = new Map<string, SpaceState>(this.spaces);
    const lists = new Map<string, TaskListState>(this.lists);
    const prefixOwners = new Map<string, string>(this.prefixOwners);
    const events: RecordedEvent[] = [...this.events];
    const store: SpacesStore = {
      spaces: {
        insert: (draft: SpaceDraft): Promise<Space> => {
          const state: SpaceState = {
            ...draft,
            id: this.nextId('019a7200'),
            createdAt: this.nextCreatedAt(),
            version: 1,
          };
          spaces.set(state.id, state);
          return Promise.resolve(Space.restore(state));
        },
        find: (organizationId: string, id: string): Promise<Space | null> => {
          const state: SpaceState | undefined = spaces.get(id);
          return Promise.resolve(
            state?.organizationId === organizationId ? Space.restore(state) : null,
          );
        },
        lock: (organizationId: string, id: string): Promise<Space | null> => {
          const state: SpaceState | undefined = spaces.get(id);
          return Promise.resolve(
            state?.organizationId === organizationId ? Space.restore(state) : null,
          );
        },
        update: (space: Space): Promise<void> => {
          spaces.set(space.snapshot.id, space.snapshot);
          return Promise.resolve();
        },
        listVisible: (
          organizationId: string,
          viewerUserId: string,
          after: PagePosition | null,
          limit: number,
        ): Promise<Space[]> => {
          this.listVisibleCalls.push({ organizationId, viewerUserId, after, limit });
          const visible: SpaceState[] = [...spaces.values()].filter(
            (row: SpaceState): boolean =>
              row.organizationId === organizationId &&
              (row.visibility === 'organization' || row.ownerUserId === viewerUserId),
          );
          return Promise.resolve(
            InMemorySpaces.page(visible, after, limit).map((row: SpaceState): Space =>
              Space.restore(row),
            ),
          );
        },
        lockPrivateOwnedBy: (organizationId: string, ownerUserId: string): Promise<Space[]> =>
          Promise.resolve(
            [...spaces.values()]
              .filter(
                (row: SpaceState): boolean =>
                  row.organizationId === organizationId &&
                  row.visibility === 'private' &&
                  row.ownerUserId === ownerUserId,
              )
              .map((row: SpaceState): Space => Space.restore(row)),
          ),
      },
      prefixes: {
        claim: (organizationId: string, prefix: string, spaceId: string): Promise<boolean> => {
          const key: string = InMemorySpaces.prefixKey(organizationId, prefix);
          const holder: string | undefined = prefixOwners.get(key);
          if (holder === undefined) {
            prefixOwners.set(key, spaceId);
            return Promise.resolve(true);
          }
          return Promise.resolve(holder === spaceId);
        },
        nextNumbers: (
          organizationId: string,
          prefixes: readonly string[],
        ): Promise<ReadonlyMap<string, number>> => {
          this.nextNumbersCalls.push(prefixes);
          return Promise.resolve(
            new Map(
              prefixes.map((prefix: string): [string, number] => [
                prefix,
                (this.lastNumbers.get(InMemorySpaces.prefixKey(organizationId, prefix)) ?? 0) + 1,
              ]),
            ),
          );
        },
      },
      lists: {
        insert: (draft: TaskListDraft): Promise<TaskList> => {
          const state: TaskListState = {
            ...draft,
            id: this.nextId('019a7300'),
            createdAt: this.nextCreatedAt(),
            version: 1,
          };
          lists.set(state.id, state);
          return Promise.resolve(TaskList.restore(state));
        },
        find: (organizationId: string, id: string): Promise<TaskList | null> => {
          const state: TaskListState | undefined = lists.get(id);
          return Promise.resolve(
            state?.organizationId === organizationId ? TaskList.restore(state) : null,
          );
        },
        lock: (organizationId: string, id: string): Promise<TaskList | null> => {
          const state: TaskListState | undefined = lists.get(id);
          return Promise.resolve(
            state?.organizationId === organizationId ? TaskList.restore(state) : null,
          );
        },
        update: (list: TaskList): Promise<void> => {
          lists.set(list.snapshot.id, list.snapshot);
          return Promise.resolve();
        },
        listOfSpace: (
          organizationId: string,
          spaceId: string,
          after: PagePosition | null,
          limit: number,
        ): Promise<TaskList[]> => {
          this.listOfSpaceCalls.push({ spaceId, after, limit });
          const inSpace: TaskListState[] = [...lists.values()].filter(
            (row: TaskListState): boolean =>
              row.organizationId === organizationId && row.spaceId === spaceId,
          );
          return Promise.resolve(
            InMemorySpaces.page(inSpace, after, limit).map((row: TaskListState): TaskList =>
              TaskList.restore(row),
            ),
          );
        },
      },
      events: {
        spaceCreated: (space: Space, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'spaceCreated',
            spaceId: space.snapshot.id,
            version: space.snapshot.version,
            actor,
          });
          return Promise.resolve();
        },
        spaceUpdated: (
          space: Space,
          changed: readonly SpaceField[],
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'spaceUpdated',
            spaceId: space.snapshot.id,
            version: space.snapshot.version,
            changed,
            actor,
          });
          return Promise.resolve();
        },
        listCreated: (list: TaskList, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'listCreated',
            listId: list.snapshot.id,
            spaceId: list.snapshot.spaceId,
            actor,
          });
          return Promise.resolve();
        },
        listUpdated: (
          list: TaskList,
          changed: readonly TaskListField[],
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'listUpdated',
            listId: list.snapshot.id,
            version: list.snapshot.version,
            changed,
            actor,
          });
          return Promise.resolve();
        },
      },
    };
    const result: TResult = await work(store);
    this.spaces = spaces;
    this.lists = lists;
    this.prefixOwners = prefixOwners;
    this.events = events;
    return result;
  }

  /**
   * Method nextId
   *
   * @description
   * Gives the next id of a row the fake inserts.
   *
   * @param {string} group - The first group of the id, which tells spaces from lists.
   * @returns {string} The id.
   */
  private nextId(group: string): string {
    this.sequence += 1;
    return `${group}-0000-7000-8000-${String(this.sequence).padStart(12, '0')}`;
  }

  /**
   * Method nextCreatedAt
   *
   * @description
   * Gives the creation time of the row the fake inserts: one second after the previous one.
   *
   * @returns {Date} The time.
   */
  private nextCreatedAt(): Date {
    return new Date(FIRST_CREATION + this.sequence * 1000);
  }
  // #endregion
}

/** An account the copy of the members does not know. */
export const STRANGER = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1bff';

/** How the copy of the members of Atelier Nord differs from the usual one. */
export interface AtelierNordMembersOptions {
  // #region Properties
  /**
   * Property ownerKnown
   *
   * @description
   * Whether the copy knows the owner of the organization; `true` by default.
   *
   * @type {boolean}
   * @readonly
   */
  readonly ownerKnown?: boolean;

  /**
   * Property removed
   *
   * @description
   * Accounts whose membership the copy no longer holds, as after `member.removed.v1`.
   *
   * @type {readonly string[]}
   * @readonly
   */
  readonly removed?: readonly string[];
  // #endregion
}

/**
 * Builds the copy of the members of Atelier Nord: Camille Martin owns it, Inès Robert is an admin,
 * Hugo Dubois and Léa Petit are members and Nadia Benali is a guest.
 *
 * @param options - What differs from the usual copy.
 * @returns The fake member directory.
 */
export function atelierNordMembers(options: AtelierNordMembersOptions = {}): InMemoryMembers {
  const removed: readonly string[] = options.removed ?? [];
  const roles: Readonly<Record<string, MemberRole>> = {
    [CAMILLE]: 'owner',
    [INES]: 'admin',
    [HUGO]: 'member',
    [LEA]: 'member',
    [NADIA]: 'guest',
  };
  return new InMemoryMembers(
    ATELIER_NORD,
    Object.fromEntries(
      Object.entries(roles).filter(
        ([userId]: [string, MemberRole]): boolean => !removed.includes(userId),
      ),
    ),
    options.ownerKnown === false ? null : CAMILLE,
  );
}

/**
 * Waits for work that must be refused and returns the refusal.
 *
 * @param work - The pending work.
 * @returns The reason of the refusal.
 * @throws {Error} When the work resolves or rejects with something else than a `SpaceRefusal`.
 */
export async function refusalOf(work: Promise<unknown>): Promise<SpaceRefusalReason> {
  try {
    await work;
  } catch (error: unknown) {
    if (error instanceof SpaceRefusal) {
      return error.refusal;
    }
    throw error;
  }
  throw new Error('The work was expected to be refused.');
}
