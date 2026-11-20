import { TaskList } from '../../domain/aggregates/list/task-list.aggregate.js';
import { Space } from '../../domain/aggregates/space/space.aggregate.js';
import { positionInSpaceOf } from '../../domain/policies/list/list-position.policy.js';
import { positionInSidebarOf } from '../../domain/policies/space/space-position.policy.js';
import type { AccessRole } from '../../domain/value-objects/access/access-role.value-object.js';
import type { GrantEntry } from '../../domain/value-objects/access/grant-entry.value-object.js';
import type { ListActor } from '../../domain/value-objects/list/list-actor.value-object.js';
import type { TaskListDraft } from '../../domain/value-objects/list/task-list-draft.value-object.js';
import type { TaskListField } from '../../domain/value-objects/list/task-list-field.value-object.js';
import type { TaskListState } from '../../domain/value-objects/list/task-list-state.value-object.js';
import type { MemberRole } from '../../domain/value-objects/member/member-role.value-object.js';
import type { Viewer } from '../../domain/value-objects/member/viewer.value-object.js';
import type { SpaceDraft } from '../../domain/value-objects/space/space-draft.value-object.js';
import type { SpaceField } from '../../domain/value-objects/space/space-field.value-object.js';
import type { SpaceState } from '../../domain/value-objects/space/space-state.value-object.js';
import type { EventActor } from '../models/actor/event-actor.model.js';
import type { GrantedResource } from '../models/access/granted-resource.model.js';
import type { ListAccess } from '../models/access/list-access.model.js';
import type { ListWithGrants } from '../models/access/list-with-grants.model.js';
import type { SpaceWithGrants } from '../models/access/space-with-grants.model.js';
import type { StoredGrant } from '../models/access/stored-grant.model.js';
import type { ViewerGrants } from '../models/access/viewer-grants.model.js';
import type { TrashListAccess } from '../models/list/trash-list-access.model.js';
import type { ArchivedListPosition } from '../models/page/archived-list-position.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { SpacesStore } from '../models/transactions/spaces-store.model.js';
import type { TrashWrites } from '../ports/outbound/feature/trash/trash-writes.port.js';
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
  ARCHIVED_AT,
  ATELIER_NORD,
  BACKLOG,
  CAMILLE,
  CREATED_AT,
  DELETED_AT,
  DESIGN,
  HUGO,
  INES,
  LEA,
  MARKETING,
  NADIA,
  PRODUIT,
  RESTORED_FROM_TRASH_AT,
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

/** When the grants a spec seeds were first given ("le 4 mars"). */
export const GRANTED_AT: Date = new Date('2026-03-04T14:05:00Z');

/** When the first space, list or grant created by a spec gets its instant; each next one is a second later. */
const FIRST_CREATION: number = Date.parse('2026-11-18T10:00:00Z');

/** The instant of the transactions of the fake store, unless a spec sets another. */
export const TRANSACTION_INSTANT: Date = new Date('2026-11-19T08:30:00Z');

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

/** A grant the fake stores, of Atelier Nord unless the spec says otherwise. */
export interface FakeGrant extends StoredGrant {
  // #region Properties
  /**
   * Property organizationId
   *
   * @description
   * The organization of the grant.
   *
   * @type {string}
   * @readonly
   */
  readonly organizationId: string;

  /**
   * Property resource
   *
   * @description
   * The space or the list the grant opens.
   *
   * @type {GrantedResource}
   * @readonly
   */
  readonly resource: GrantedResource;
  // #endregion
}

/**
 * Builds a grant of a space given by Camille Martin.
 *
 * @param spaceId - The space.
 * @param userId - The person given access.
 * @param role - The role.
 * @param overrides - Fields to replace.
 * @returns The grant.
 */
export function spaceGrantOf(
  spaceId: string,
  userId: string,
  role: AccessRole,
  overrides: Partial<FakeGrant> = {},
): FakeGrant {
  return {
    organizationId: ATELIER_NORD,
    resource: { kind: 'space', spaceId },
    userId,
    role,
    createdAt: GRANTED_AT,
    grantedAt: GRANTED_AT,
    grantedBy: { type: 'user', id: CAMILLE },
    ...overrides,
  };
}

/**
 * Builds a grant of a list given by Camille Martin.
 *
 * @param spaceId - The space of the list.
 * @param listId - The list.
 * @param userId - The person given access.
 * @param role - The role.
 * @param overrides - Fields to replace.
 * @returns The grant.
 */
export function listGrantOf(
  spaceId: string,
  listId: string,
  userId: string,
  role: AccessRole,
  overrides: Partial<FakeGrant> = {},
): FakeGrant {
  return {
    organizationId: ATELIER_NORD,
    resource: { kind: 'list', spaceId, listId },
    userId,
    role,
    createdAt: GRANTED_AT,
    grantedAt: GRANTED_AT,
    grantedBy: { type: 'user', id: CAMILLE },
    ...overrides,
  };
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
    }
  | {
      readonly kind: 'listArchived';
      readonly listId: string;
      readonly version: number;
      readonly archivedAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listUnarchived';
      readonly listId: string;
      readonly version: number;
      readonly restoredAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'spaceDeleted';
      readonly spaceId: string;
      readonly version: number;
      readonly deletedAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'spaceRestored';
      readonly spaceId: string;
      readonly version: number;
      readonly restoredAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listDeleted';
      readonly listId: string;
      readonly spaceId: string;
      readonly version: number;
      readonly deletedAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listRestored';
      readonly listId: string;
      readonly version: number;
      readonly restoredAt: Date | null;
      readonly archivedAt: Date | null;
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'spaceAccessChanged';
      readonly spaceId: string;
      readonly version: number;
      readonly grants: readonly GrantEntry[];
      readonly changedUserIds: readonly string[];
      readonly actor: EventActor;
    }
  | {
      readonly kind: 'listAccessChanged';
      readonly listId: string;
      readonly spaceId: string;
      readonly version: number;
      readonly organizationAccess: boolean;
      readonly grants: readonly GrantEntry[];
      readonly changed: readonly ('grants' | 'organizationAccess')[];
      readonly changedUserIds: readonly string[];
      readonly actor: EventActor;
    };

/** A job of `task.trash-deleted-tasks` the use cases enqueued, as plain data. */
export interface RecordedTrashJob {
  // #region Properties
  /**
   * Property payload
   *
   * @description
   * The deleted list or space.
   *
   * @type {{ readonly listId: string } | { readonly spaceId: string }}
   * @readonly
   */
  readonly payload: { readonly listId: string } | { readonly spaceId: string };

  /**
   * Property occurrenceKey
   *
   * @description
   * The occurrence key the adapter gives the job.
   *
   * @type {string}
   * @readonly
   */
  readonly occurrenceKey: string;
  // #endregion
}

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
   * Property grants
   *
   * @description
   * The grants of spaces and lists already stored.
   *
   * @type {readonly FakeGrant[]}
   * @readonly
   */
  readonly grants?: readonly FakeGrant[];

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

  /**
   * Property now
   *
   * @description
   * The instant of every transaction of the fake (`TransactionClock.now`); `TRANSACTION_INSTANT`
   * by default.
   *
   * @type {Date}
   * @readonly
   */
  readonly now?: Date;
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
   * Property journal
   *
   * @description
   * Where the locked memberships are written (`membership <account>`); a spec shares it with the
   * journal of `InMemorySpaces` to check the lock order.
   *
   * @type {string[]}
   */
  public journal: string[] = [];

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
    if (lock === true) {
      this.journal.push(`membership ${userId}`);
    }
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
 * A fake `SpacesUnitOfWork` holding the spaces, lists, grants, prefixes and outbox in memory, with
 * no database: the work runs on a copy that is committed only when it resolves, as the tenant
 * transaction is, so a refusal leaves no row and no event. It scopes every read to the
 * organization as the repositories do, keeps in its collections the rows the one visibility
 * condition of each resource keeps (written again here from the SQL, not from the policies),
 * leaves the archived lists out of the collections of a space, of the sprints and of the sidebar
 * (`liveListCondition`), leaves the tombstones out of every reading by id, lock before a change
 * and collection (`undeletedListCondition`, `undeletedSpaceCondition`) and reads them in the
 * trash with the role "as if not deleted" (`listAccessCondition`), orders the lists of a space by
 * `coalesce(restored_at, created_at)` then id and the spaces by the same expression of theirs, and
 * records the calls, the locks and the jobs the specs count. Its clock gives `now` to every
 * transaction. Its erasures refuse what the foreign keys of the tables refuse.
 */
export class InMemorySpaces implements SpacesUnitOfWork {
  // #region Properties
  /** Cleanup operations committed with the transaction. */
  public libraryCleanupCalls: {
    readonly operation: 'views' | 'templates' | 'favorites';
    readonly organizationId: string;
    readonly targetIds: readonly string[];
    readonly kind?: 'list' | 'space';
  }[] = [];

  /** A failure injected into library cleanup to exercise rollback. */
  public libraryCleanupError: Error | null = null;

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
   * Property grants
   *
   * @description
   * The committed grants, in insertion order.
   *
   * @type {FakeGrant[]}
   */
  public grants: FakeGrant[];

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
   * Property jobs
   *
   * @description
   * The jobs of `task.trash-deleted-tasks` of the committed work, in the order they were enqueued;
   * an occurrence key enqueued again is a duplicate, as the kit keeps one job per occurrence.
   *
   * @type {RecordedTrashJob[]}
   */
  public jobs: RecordedTrashJob[] = [];

  /**
   * Property journal
   *
   * @description
   * The locks taken, in order (`space <id>`, `space <id> share`, `space <id> delete`,
   * `space <id> share unless locked`, `list <id>`, `list <id> share`, `list <id> delete`,
   * `list <id> share unless locked`), committed or not; a spec shares it with the journal of
   * `InMemoryMembers` to check the lock order.
   *
   * @type {string[]}
   */
  public journal: string[] = [];

  /**
   * Property heldByWriter
   *
   * @description
   * The ids of the spaces and lists another transaction holds `FOR NO KEY UPDATE` or `FOR UPDATE`
   * (a change or a deletion under way): `lockSharedUnlessLocked` leaves them out, as
   * `FOR SHARE SKIP LOCKED` does; every other lock ignores them.
   *
   * @type {Set<string>}
   * @readonly
   */
  public readonly heldByWriter: Set<string> = new Set<string>();

  /**
   * Property reads
   *
   * @description
   * The readings by id, in order (`space` and `list` for `find`, `lists` for
   * `findManyIncludingDeleted`, `grants` for `viewerGrants`, `trash access` for
   * `findTrashAccessVisibleTo`, `trash accesses` for `listTrashAccessesVisibleTo`), whatever they
   * found: what a spec compares to tell whether a path reads more than another.
   *
   * @type {string[]}
   * @readonly
   */
  public readonly reads: string[] = [];

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
   * Property viewerGrantsCalls
   *
   * @description
   * The arguments of each `viewerGrants` call: the one statement that reads the grants of a member.
   *
   * @type {{ viewerUserId: string; spaceId: string; listId: string | null }[]}
   * @readonly
   */
  public readonly viewerGrantsCalls: {
    readonly viewerUserId: string;
    readonly spaceId: string;
    readonly listId: string | null;
  }[] = [];

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
   * The arguments of each `listOfSpaceVisibleTo` call.
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
   * Property allocateCalls
   *
   * @description
   * The arguments of each `allocate` call, committed or not.
   *
   * @type {{ organizationId: string; prefix: string; spaceId: string; count: number }[]}
   * @readonly
   */
  public readonly allocateCalls: {
    readonly organizationId: string;
    readonly prefix: string;
    readonly spaceId: string;
    readonly count: number;
  }[] = [];

  /**
   * Property listAllOfSpaceCalls
   *
   * @description
   * The space of each `listAllOfSpaceVisibleTo` call.
   *
   * @type {string[]}
   * @readonly
   */
  public readonly listAllOfSpaceCalls: string[] = [];

  /**
   * Property listCurrentSprintsCalls
   *
   * @description
   * The arguments of each `listCurrentSprintsVisibleTo` call.
   *
   * @type {{ organizationId: string; viewerUserId: string; today: string; limit: number }[]}
   * @readonly
   */
  public readonly listCurrentSprintsCalls: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly today: string;
    readonly limit: number;
  }[] = [];

  /**
   * Property listFirstVisibleCalls
   *
   * @description
   * The arguments of each `listFirstVisibleTo` call.
   *
   * @type {{ organizationId: string; viewerUserId: string; limit: number }[]}
   * @readonly
   */
  public readonly listFirstVisibleCalls: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly limit: number;
  }[] = [];

  /**
   * Property listArchivedCalls
   *
   * @description
   * The arguments of each `listArchivedVisibleTo` call.
   *
   * @type {{ organizationId: string; viewerUserId: string; after: ArchivedListPosition | null; limit: number }[]}
   * @readonly
   */
  public readonly listArchivedCalls: {
    readonly organizationId: string;
    readonly viewerUserId: string;
    readonly after: ArchivedListPosition | null;
    readonly limit: number;
  }[] = [];

  /**
   * Property listVisibleByIdsCalls
   *
   * @description
   * The ids of each `listVisibleByIds` call.
   *
   * @type {(readonly string[])[]}
   * @readonly
   */
  public readonly listVisibleByIdsCalls: (readonly string[])[] = [];

  /**
   * Property now
   *
   * @description
   * The instant the clock gives to every transaction.
   *
   * @type {Date}
   */
  public now: Date;

  /**
   * Property clockReads
   *
   * @description
   * How many times a transaction read the clock, committed or not.
   *
   * @type {number}
   */
  public clockReads: number = 0;

  /**
   * Property lastNumbers
   *
   * @description
   * The last task number given for each prefix of Atelier Nord; replaced when a unit of work
   * commits, so that a rollback gives the numbers back.
   *
   * @type {Map<string, number>}
   */
  private lastNumbers: Map<string, number>;

  /**
   * Property sequence
   *
   * @description
   * Counter of the ids and instants the fake gives.
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
    this.grants = [...(seed.grants ?? [])];
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
    this.now = seed.now ?? TRANSACTION_INSTANT;
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
   * Method roleOfGrant
   *
   * @description
   * The role of the grant of an account on a space or a list, `null` without one.
   *
   * @param {readonly FakeGrant[]} grants - The grants of the work.
   * @param {string} organizationId - The organization.
   * @param {GrantedResource} resource - The space or the list.
   * @param {string} userId - The account.
   * @returns {AccessRole | null} The role.
   */
  private static roleOfGrant(
    grants: readonly FakeGrant[],
    organizationId: string,
    resource: GrantedResource,
    userId: string,
  ): AccessRole | null {
    return (
      grants.find(
        (grant: FakeGrant): boolean =>
          grant.organizationId === organizationId &&
          grant.userId === userId &&
          InMemorySpaces.sameResource(grant.resource, resource),
      )?.role ?? null
    );
  }

  /**
   * Method sameResource
   *
   * @description
   * Whether two grants open the same space or the same list.
   *
   * @param {GrantedResource} left - One resource.
   * @param {GrantedResource} right - The other.
   * @returns {boolean} Whether they are the same.
   */
  private static sameResource(left: GrantedResource, right: GrantedResource): boolean {
    if (left.kind === 'space' && right.kind === 'space') {
      return left.spaceId === right.spaceId;
    }
    if (left.kind === 'list' && right.kind === 'list') {
      return left.listId === right.listId;
    }
    return false;
  }

  /**
   * Method anyListGrant
   *
   * @description
   * Whether an account holds a grant of at least one list of a space that is not deleted: a
   * grant of a tombstone shows no space.
   *
   * @param {readonly FakeGrant[]} grants - The grants of the work.
   * @param {ReadonlyMap<string, TaskListState>} lists - The lists of the work.
   * @param {string} organizationId - The organization.
   * @param {string} spaceId - The space.
   * @param {string} userId - The account.
   * @returns {boolean} Whether it does.
   */
  private static anyListGrant(
    grants: readonly FakeGrant[],
    lists: ReadonlyMap<string, TaskListState>,
    organizationId: string,
    spaceId: string,
    userId: string,
  ): boolean {
    return grants.some(
      (grant: FakeGrant): boolean =>
        grant.organizationId === organizationId &&
        grant.userId === userId &&
        grant.resource.kind === 'list' &&
        grant.resource.spaceId === spaceId &&
        (lists.get(grant.resource.listId)?.deletedAt ?? null) === null,
    );
  }

  /**
   * Method spaceRow
   *
   * @description
   * A space with the grants of a member there, when the visibility condition of the spaces keeps
   * it: not deleted, not awaiting an owner, and for a member who is not a guest the whole
   * organization, the owner or a grant of the space, for anyone a grant of one of its lists that
   * is not deleted.
   *
   * @param {SpaceState} space - The space.
   * @param {readonly FakeGrant[]} grants - The grants of the work.
   * @param {ReadonlyMap<string, TaskListState>} lists - The lists of the work.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member.
   * @returns {SpaceWithGrants | null} The row, or `null` when the condition leaves it out.
   */
  private static spaceRow(
    space: SpaceState,
    grants: readonly FakeGrant[],
    lists: ReadonlyMap<string, TaskListState>,
    organizationId: string,
    viewer: Viewer,
  ): SpaceWithGrants | null {
    if (
      space.organizationId !== organizationId ||
      space.awaitingOwner ||
      space.deletedAt !== null
    ) {
      return null;
    }
    const spaceGrant: AccessRole | null = InMemorySpaces.roleOfGrant(
      grants,
      organizationId,
      { kind: 'space', spaceId: space.id },
      viewer.userId,
    );
    const anyList: boolean = InMemorySpaces.anyListGrant(
      grants,
      lists,
      organizationId,
      space.id,
      viewer.userId,
    );
    const member: boolean =
      viewer.role !== 'guest' &&
      (space.visibility === 'organization' ||
        space.ownerUserId === viewer.userId ||
        spaceGrant !== null);
    if (!member && !anyList) {
      return null;
    }
    return { space: Space.restore(space), grants: { space: spaceGrant, list: null, anyList } };
  }

  /**
   * Method listRow
   *
   * @description
   * A list with the grants of a member there, when the visibility condition of the lists keeps
   * it: neither the list nor its space deleted, and `trashRow`.
   *
   * @param {TaskListState} list - The list.
   * @param {ReadonlyMap<string, SpaceState>} spaces - The spaces of the work.
   * @param {readonly FakeGrant[]} grants - The grants of the work.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member.
   * @returns {ListWithGrants | null} The row, or `null` when the condition leaves it out.
   */
  private static listRow(
    list: TaskListState,
    spaces: ReadonlyMap<string, SpaceState>,
    grants: readonly FakeGrant[],
    organizationId: string,
    viewer: Viewer,
  ): ListWithGrants | null {
    if (list.deletedAt !== null || spaces.get(list.spaceId)?.deletedAt !== null) {
      return null;
    }
    return InMemorySpaces.trashRow(list, spaces, grants, organizationId, viewer);
  }

  /**
   * Method trashRow
   *
   * @description
   * A list with the grants of a member there, deleted or not, when the condition of the role "as if
   * not deleted" keeps it: not of a space awaiting an owner, and a grant of the list, or for a
   * member who is not a guest the owner of the space, a space of the organization with the switch
   * on, or a grant of the space.
   *
   * @param {TaskListState} list - The list.
   * @param {ReadonlyMap<string, SpaceState>} spaces - The spaces of the work.
   * @param {readonly FakeGrant[]} grants - The grants of the work.
   * @param {string} organizationId - The organization of the transaction.
   * @param {Viewer} viewer - The member.
   * @returns {ListWithGrants | null} The row, or `null` when the condition leaves it out.
   */
  private static trashRow(
    list: TaskListState,
    spaces: ReadonlyMap<string, SpaceState>,
    grants: readonly FakeGrant[],
    organizationId: string,
    viewer: Viewer,
  ): ListWithGrants | null {
    const space: SpaceState | undefined = spaces.get(list.spaceId);
    if (list.organizationId !== organizationId || space === undefined || space.awaitingOwner) {
      return null;
    }
    const spaceGrant: AccessRole | null = InMemorySpaces.roleOfGrant(
      grants,
      organizationId,
      { kind: 'space', spaceId: space.id },
      viewer.userId,
    );
    const listGrant: AccessRole | null = InMemorySpaces.roleOfGrant(
      grants,
      organizationId,
      { kind: 'list', spaceId: space.id, listId: list.id },
      viewer.userId,
    );
    const member: boolean =
      viewer.role !== 'guest' &&
      (space.ownerUserId === viewer.userId ||
        (space.visibility === 'organization' && list.organizationAccess) ||
        spaceGrant !== null);
    if (listGrant === null && !member) {
      return null;
    }
    return {
      list: TaskList.restore(list),
      space: {
        visibility: space.visibility,
        ownerUserId: space.ownerUserId,
        awaitingOwner: space.awaitingOwner,
        deletedAt: space.deletedAt,
      },
      grants: { space: spaceGrant, list: listGrant },
    };
  }

  /**
   * Method sidebarOrder
   *
   * @description
   * Compares two lists in sidebar order: their spaces by their position in the sidebar
   * (`coalesce(restored_at, created_at)`, id as tie-breaker), then the lists by their position in
   * the space (`coalesce(restored_at, created_at)`, id as tie-breaker).
   *
   * @param {ReadonlyMap<string, SpaceState>} spaces - The spaces of the work.
   * @param {TaskListState} left - One list.
   * @param {TaskListState} right - The other.
   * @returns {number} The order.
   */
  private static sidebarOrder(
    spaces: ReadonlyMap<string, SpaceState>,
    left: TaskListState,
    right: TaskListState,
  ): number {
    const leftSpace: SpaceState | undefined = spaces.get(left.spaceId);
    const rightSpace: SpaceState | undefined = spaces.get(right.spaceId);
    return (
      (leftSpace === undefined ? 0 : positionInSidebarOf(leftSpace).getTime()) -
        (rightSpace === undefined ? 0 : positionInSidebarOf(rightSpace).getTime()) ||
      left.spaceId.localeCompare(right.spaceId) ||
      InMemorySpaces.spaceOrder(left, right)
    );
  }

  /**
   * Method spaceOrder
   *
   * @description
   * Compares two lists of a space by their position there, `coalesce(restored_at, created_at)`,
   * id as tie-breaker.
   *
   * @param {TaskListState} left - One list.
   * @param {TaskListState} right - The other.
   * @returns {number} The order.
   */
  private static spaceOrder(left: TaskListState, right: TaskListState): number {
    return (
      positionInSpaceOf(left).getTime() - positionInSpaceOf(right).getTime() ||
      left.id.localeCompare(right.id)
    );
  }

  /**
   * Method pageOfSpace
   *
   * @description
   * Sorts the lists of a space by their position there and keeps those after a position, as the
   * keyset query of the lists of a space does.
   *
   * @param {readonly TaskListState[]} rows - The lists.
   * @param {PagePosition | null} after - The last list of the previous page, or `null`.
   * @param {number} limit - How many lists at most.
   * @returns {TaskListState[]} The lists of the page.
   */
  private static pageOfSpace(
    rows: readonly TaskListState[],
    after: PagePosition | null,
    limit: number,
  ): TaskListState[] {
    return [...rows]
      .sort((left: TaskListState, right: TaskListState): number =>
        InMemorySpaces.spaceOrder(left, right),
      )
      .filter((row: TaskListState): boolean => {
        const position: number = positionInSpaceOf(row).getTime();
        return (
          after === null ||
          position > after.createdAt.getTime() ||
          (position === after.createdAt.getTime() && row.id > after.id)
        );
      })
      .slice(0, limit);
  }

  /**
   * Method isLive
   *
   * @description
   * Whether a list is live, the condition `liveListCondition` of the collections of a space, of
   * the sprints and of the sidebar.
   *
   * @param {TaskListState} row - The list.
   * @returns {boolean} Whether it is not archived.
   */
  private static isLive(row: TaskListState): boolean {
    return row.archivedAt === null;
  }

  /**
   * Method pageOfSidebar
   *
   * @description
   * Sorts spaces by their position in the sidebar (`coalesce(restored_at, created_at)`, id as
   * tie-breaker) and keeps those after a position, as the keyset query of the spaces does.
   *
   * @param {readonly SpaceState[]} rows - The spaces.
   * @param {PagePosition | null} after - The last space of the previous page, or `null`.
   * @param {number} limit - How many spaces at most.
   * @returns {SpaceState[]} The spaces of the page.
   */
  private static pageOfSidebar(
    rows: readonly SpaceState[],
    after: PagePosition | null,
    limit: number,
  ): SpaceState[] {
    return [...rows]
      .sort(
        (left: SpaceState, right: SpaceState): number =>
          positionInSidebarOf(left).getTime() - positionInSidebarOf(right).getTime() ||
          left.id.localeCompare(right.id),
      )
      .filter((row: SpaceState): boolean => {
        const position: number = positionInSidebarOf(row).getTime();
        return (
          after === null ||
          position > after.createdAt.getTime() ||
          (position === after.createdAt.getTime() && row.id > after.id)
        );
      })
      .slice(0, limit);
  }

  /**
   * Method lastNumberOf
   *
   * @description
   * The last task number committed for a prefix, 0 when none was given.
   *
   * @param {string} organizationId - The organization.
   * @param {string} prefix - The prefix.
   * @returns {number} The counter.
   */
  public lastNumberOf(organizationId: string, prefix: string): number {
    return this.lastNumbers.get(InMemorySpaces.prefixKey(organizationId, prefix)) ?? 0;
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
    let grants: FakeGrant[] = [...this.grants];
    const prefixOwners = new Map<string, string>(this.prefixOwners);
    const lastNumbers = new Map<string, number>(this.lastNumbers);
    const events: RecordedEvent[] = [...this.events];
    const jobs: RecordedTrashJob[] = [...this.jobs];
    const libraryCleanupCalls = [...this.libraryCleanupCalls];
    const findAnySpace = (organizationId: string, id: string): Space | null => {
      const state: SpaceState | undefined = spaces.get(id);
      return state?.organizationId === organizationId ? Space.restore(state) : null;
    };
    const findSpace = (organizationId: string, id: string): Space | null => {
      const space: Space | null = findAnySpace(organizationId, id);
      return space === null || space.isDeleted ? null : space;
    };
    const findAnyList = (organizationId: string, id: string): TaskList | null => {
      const state: TaskListState | undefined = lists.get(id);
      return state?.organizationId === organizationId ? TaskList.restore(state) : null;
    };
    const findList = (organizationId: string, id: string): TaskList | null => {
      const list: TaskList | null = findAnyList(organizationId, id);
      return list === null || list.isDeleted ? null : list;
    };
    const toTrashAccess = (row: ListWithGrants): TrashListAccess => ({
      listId: row.list.snapshot.id,
      spaceId: row.list.snapshot.spaceId,
      name: row.list.snapshot.name,
      organizationAccess: row.list.snapshot.organizationAccess,
      archivedAt: row.list.snapshot.archivedAt,
      deletedAt: row.list.snapshot.deletedAt,
      space: row.space,
      grants: row.grants,
    });
    const visibleSpaces = (organizationId: string, viewer: Viewer): SpaceWithGrants[] =>
      InMemorySpaces.pageOfSidebar([...spaces.values()], null, Number.MAX_SAFE_INTEGER)
        .map((space: SpaceState) =>
          InMemorySpaces.spaceRow(space, grants, lists, organizationId, viewer),
        )
        .filter((row: SpaceWithGrants | null): row is SpaceWithGrants => row !== null);
    const visibleLists = (
      organizationId: string,
      viewer: Viewer,
      rows: readonly TaskListState[],
    ): ListWithGrants[] =>
      rows
        .map((list: TaskListState) =>
          InMemorySpaces.listRow(list, spaces, grants, organizationId, viewer),
        )
        .filter((row: ListWithGrants | null): row is ListWithGrants => row !== null);
    const archivedLists = (organizationId: string, viewer: Viewer): ListWithGrants[] =>
      visibleLists(
        organizationId,
        viewer,
        [...lists.values()]
          .filter((row: TaskListState): boolean => row.archivedAt !== null)
          .sort(
            (left: TaskListState, right: TaskListState): number =>
              (right.archivedAt?.getTime() ?? 0) - (left.archivedAt?.getTime() ?? 0) ||
              right.id.localeCompare(left.id),
          ),
      );
    const store: SpacesStore = {
      spaces: {
        insert: (draft: SpaceDraft): Promise<Space> => {
          const state: SpaceState = {
            ...draft,
            id: this.nextId('019a7200'),
            createdAt: this.nextInstant(),
            deletedAt: null,
            deletedBy: null,
            restoredAt: null,
            version: 1,
          };
          spaces.set(state.id, state);
          return Promise.resolve(Space.restore(state));
        },
        find: (organizationId: string, id: string): Promise<Space | null> => {
          this.reads.push('space');
          return Promise.resolve(findSpace(organizationId, id));
        },
        lock: (organizationId: string, id: string): Promise<Space | null> => {
          this.journal.push(`space ${id}`);
          return Promise.resolve(findSpace(organizationId, id));
        },
        lockShared: (organizationId: string, id: string): Promise<Space | null> => {
          this.journal.push(`space ${id} share`);
          return Promise.resolve(findSpace(organizationId, id));
        },
        lockSharedUnlessLocked: (organizationId: string, id: string): Promise<Space | null> => {
          this.journal.push(`space ${id} share unless locked`);
          return Promise.resolve(this.heldByWriter.has(id) ? null : findSpace(organizationId, id));
        },
        lockInOrder: (
          organizationId: string,
          locks: readonly { readonly id: string; readonly mode: 'update' | 'share' }[],
        ): Promise<Space[]> => {
          const found: Space[] = InMemorySpaces.page(
            locks
              .map(({ id }): Space | null => findAnySpace(organizationId, id))
              .filter((space: Space | null): space is Space => space !== null)
              .map((space: Space): SpaceState => space.snapshot),
            null,
            Number.MAX_SAFE_INTEGER,
          ).map((state: SpaceState): Space => Space.restore(state));
          for (const space of found) {
            const mode: 'update' | 'share' | undefined = locks.find(
              (lock): boolean => lock.id === space.snapshot.id,
            )?.mode;
            this.journal.push(`space ${space.snapshot.id}${mode === 'share' ? ' share' : ''}`);
          }
          return Promise.resolve(found);
        },
        update: (space: Space): Promise<void> => {
          spaces.set(space.snapshot.id, space.snapshot);
          return Promise.resolve();
        },
        listVisible: (
          organizationId: string,
          viewer: Viewer,
          after: PagePosition | null,
          limit: number,
        ): Promise<SpaceWithGrants[]> => {
          this.listVisibleCalls.push({
            organizationId,
            viewerUserId: viewer.userId,
            after,
            limit,
          });
          const rows: SpaceWithGrants[] = visibleSpaces(organizationId, viewer);
          const kept: readonly SpaceState[] = InMemorySpaces.pageOfSidebar(
            rows.map((row: SpaceWithGrants): SpaceState => row.space.snapshot),
            after,
            limit,
          );
          return Promise.resolve(
            rows.filter((row: SpaceWithGrants): boolean => kept.includes(row.space.snapshot)),
          );
        },
        listAllVisible: (organizationId: string, viewer: Viewer): Promise<SpaceWithGrants[]> =>
          Promise.resolve(visibleSpaces(organizationId, viewer)),
        findVisibleByIds: (
          organizationId: string,
          viewer: Viewer,
          ids: readonly string[],
        ): Promise<SpaceWithGrants[]> =>
          Promise.resolve(
            visibleSpaces(organizationId, viewer).filter((row): boolean =>
              ids.includes(row.space.snapshot.id),
            ),
          ),
        lockPrivateOwnedBy: (
          organizationId: string,
          ownerUserId: string,
          limit: number,
        ): Promise<Space[]> => {
          return Promise.resolve(
            InMemorySpaces.page(
              [...spaces.values()].filter(
                (row: SpaceState): boolean =>
                  row.organizationId === organizationId &&
                  row.visibility === 'private' &&
                  row.ownerUserId === ownerUserId &&
                  !row.awaitingOwner,
              ),
              null,
              limit,
            ).map((row: SpaceState): Space => Space.restore(row)),
          );
        },
        lockAwaitingOwner: (organizationId: string): Promise<Space[]> =>
          Promise.resolve(
            [...spaces.values()]
              .filter(
                (row: SpaceState): boolean =>
                  row.organizationId === organizationId && row.awaitingOwner,
              )
              .map((row: SpaceState): Space => Space.restore(row)),
          ),
        findIncludingDeleted: (organizationId: string, id: string): Promise<Space | null> => {
          this.reads.push('space');
          return Promise.resolve(findAnySpace(organizationId, id));
        },
        lockIncludingDeleted: (
          organizationId: string,
          id: string,
          mode: 'share' | 'update' | 'delete',
        ): Promise<Space | null> => {
          this.journal.push(`space ${id}${mode === 'update' ? '' : ` ${mode}`}`);
          return Promise.resolve(findAnySpace(organizationId, id));
        },
        erase: (organizationId: string, id: string): Promise<void> => {
          const space: Space | null = findAnySpace(organizationId, id);
          if (!space?.isDeleted) {
            return Promise.reject(new Error('The deleted space to erase is not a tombstone.'));
          }
          const referenced: boolean =
            [...lists.values()].some((row: TaskListState): boolean => row.spaceId === id) ||
            grants.some(
              (grant: FakeGrant): boolean =>
                grant.organizationId === organizationId && grant.resource.spaceId === id,
            );
          if (referenced) {
            return Promise.reject(new Error('A foreign key refuses the erasure of the space.'));
          }
          spaces.delete(id);
          return Promise.resolve();
        },
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
                (lastNumbers.get(InMemorySpaces.prefixKey(organizationId, prefix)) ?? 0) + 1,
              ]),
            ),
          );
        },
        allocate: (
          organizationId: string,
          prefix: string,
          spaceId: string,
          count: number,
        ): Promise<number | null> => {
          this.allocateCalls.push({ organizationId, prefix, spaceId, count });
          const key: string = InMemorySpaces.prefixKey(organizationId, prefix);
          if (prefixOwners.get(key) !== spaceId) {
            return Promise.resolve(null);
          }
          const last: number = (lastNumbers.get(key) ?? 0) + count;
          lastNumbers.set(key, last);
          return Promise.resolve(last);
        },
      },
      lists: {
        insert: (draft: TaskListDraft): Promise<TaskList> => {
          const state: TaskListState = {
            ...draft,
            id: this.nextId('019a7300'),
            createdAt: this.nextInstant(),
            archivedAt: null,
            archivedBy: null,
            restoredAt: null,
            deletedAt: null,
            deletedBy: null,
            version: 1,
          };
          lists.set(state.id, state);
          return Promise.resolve(TaskList.restore(state));
        },
        find: (organizationId: string, id: string): Promise<TaskList | null> => {
          this.reads.push('list');
          return Promise.resolve(findList(organizationId, id));
        },
        lock: (organizationId: string, id: string): Promise<TaskList | null> => {
          this.journal.push(`list ${id}`);
          return Promise.resolve(findList(organizationId, id));
        },
        lockShared: (organizationId: string, id: string): Promise<TaskList | null> => {
          this.journal.push(`list ${id} share`);
          return Promise.resolve(findList(organizationId, id));
        },
        lockSharedUnlessLocked: (organizationId: string, id: string): Promise<TaskList | null> => {
          this.journal.push(`list ${id} share unless locked`);
          return Promise.resolve(this.heldByWriter.has(id) ? null : findList(organizationId, id));
        },
        lockMany: (
          organizationId: string,
          ids: readonly string[],
          mode: 'update' | 'delete' | 'share' = 'update',
        ): Promise<TaskList[]> => {
          const found: TaskList[] = [...new Set(ids)]
            .sort()
            .map((id: string): TaskList | null => findAnyList(organizationId, id))
            .filter((list: TaskList | null): list is TaskList => list !== null);
          for (const list of found) {
            this.journal.push(`list ${list.snapshot.id}${mode === 'update' ? '' : ` ${mode}`}`);
          }
          return Promise.resolve(found);
        },
        findManyIncludingDeleted: (
          organizationId: string,
          ids: readonly string[],
        ): Promise<TaskList[]> => {
          this.reads.push('lists');
          return Promise.resolve(
            [...new Set(ids)]
              .map((id: string): TaskList | null => findAnyList(organizationId, id))
              .filter((list: TaskList | null): list is TaskList => list !== null),
          );
        },
        lockUndeletedOfSpace: (organizationId: string, spaceId: string): Promise<string[]> => {
          const ids: string[] = [...lists.values()]
            .filter(
              (row: TaskListState): boolean =>
                row.organizationId === organizationId &&
                row.spaceId === spaceId &&
                row.deletedAt === null,
            )
            .map((row: TaskListState): string => row.id)
            .sort();
          for (const id of ids) {
            this.journal.push(`list ${id}`);
          }
          return Promise.resolve(ids);
        },
        update: (list: TaskList): Promise<void> => {
          lists.set(list.snapshot.id, list.snapshot);
          return Promise.resolve();
        },
        listOfSpaceVisibleTo: (
          organizationId: string,
          spaceId: string,
          viewer: Viewer,
          after: PagePosition | null,
          limit: number,
        ): Promise<ListWithGrants[]> => {
          this.listOfSpaceCalls.push({ spaceId, after, limit });
          const rows: ListWithGrants[] = visibleLists(
            organizationId,
            viewer,
            [...lists.values()].filter(
              (row: TaskListState): boolean =>
                row.spaceId === spaceId && InMemorySpaces.isLive(row),
            ),
          );
          const kept: readonly TaskListState[] = InMemorySpaces.pageOfSpace(
            rows.map((row: ListWithGrants): TaskListState => row.list.snapshot),
            after,
            limit,
          );
          return Promise.resolve(
            kept.map((state: TaskListState): ListWithGrants => {
              const row: ListWithGrants | undefined = rows.find(
                (candidate: ListWithGrants): boolean => candidate.list.snapshot === state,
              );
              if (row === undefined) {
                throw new Error('A kept row is a row.');
              }
              return row;
            }),
          );
        },
        listAllOfSpaceVisibleTo: (
          organizationId: string,
          spaceId: string,
          viewer: Viewer,
        ): Promise<ListWithGrants[]> => {
          this.listAllOfSpaceCalls.push(spaceId);
          return Promise.resolve(
            visibleLists(
              organizationId,
              viewer,
              InMemorySpaces.pageOfSpace(
                [...lists.values()].filter(
                  (row: TaskListState): boolean =>
                    row.spaceId === spaceId && InMemorySpaces.isLive(row),
                ),
                null,
                Number.MAX_SAFE_INTEGER,
              ),
            ),
          );
        },
        listCurrentSprintsVisibleTo: (
          organizationId: string,
          viewer: Viewer,
          today: string,
          limit: number,
        ): Promise<ListWithGrants[]> => {
          this.listCurrentSprintsCalls.push({
            organizationId,
            viewerUserId: viewer.userId,
            today,
            limit,
          });
          const current: TaskListState[] = [...lists.values()]
            .filter(
              (row: TaskListState): boolean =>
                InMemorySpaces.isLive(row) &&
                row.sprint !== null &&
                row.sprint.startDate <= today &&
                row.sprint.endDate >= today,
            )
            .sort(
              (left: TaskListState, right: TaskListState): number =>
                (left.sprint?.endDate ?? '').localeCompare(right.sprint?.endDate ?? '') ||
                left.createdAt.getTime() - right.createdAt.getTime() ||
                left.id.localeCompare(right.id),
            );
          return Promise.resolve(visibleLists(organizationId, viewer, current).slice(0, limit));
        },
        listFirstVisibleTo: (
          organizationId: string,
          viewer: Viewer,
          limit: number,
        ): Promise<ListWithGrants[]> => {
          this.listFirstVisibleCalls.push({ organizationId, viewerUserId: viewer.userId, limit });
          const ordered: TaskListState[] = [...lists.values()]
            .filter((row: TaskListState): boolean => InMemorySpaces.isLive(row))
            .sort((left: TaskListState, right: TaskListState): number =>
              InMemorySpaces.sidebarOrder(spaces, left, right),
            );
          return Promise.resolve(visibleLists(organizationId, viewer, ordered).slice(0, limit));
        },
        listAccessesVisibleTo: (organizationId: string, viewer: Viewer): Promise<ListAccess[]> => {
          const ordered: TaskListState[] = [...lists.values()].sort(
            (left: TaskListState, right: TaskListState): number =>
              InMemorySpaces.sidebarOrder(spaces, left, right),
          );
          return Promise.resolve(
            visibleLists(organizationId, viewer, ordered).map(
              (row: ListWithGrants): ListAccess => ({
                listId: row.list.snapshot.id,
                spaceId: row.list.snapshot.spaceId,
                organizationAccess: row.list.snapshot.organizationAccess,
                deletedAt: row.list.snapshot.deletedAt,
                space: row.space,
                grants: row.grants,
              }),
            ),
          );
        },
        listArchivedVisibleTo: (
          organizationId: string,
          viewer: Viewer,
          after: ArchivedListPosition | null,
          limit: number,
        ): Promise<ListWithGrants[]> => {
          this.listArchivedCalls.push({
            organizationId,
            viewerUserId: viewer.userId,
            after,
            limit,
          });
          return Promise.resolve(
            archivedLists(organizationId, viewer)
              .filter((row: ListWithGrants): boolean => {
                const { archivedAt, id } = row.list.snapshot;
                const at: number = archivedAt?.getTime() ?? 0;
                return (
                  after === null ||
                  at < after.archivedAt.getTime() ||
                  (at === after.archivedAt.getTime() && id < after.id)
                );
              })
              .slice(0, limit),
          );
        },
        countArchivedVisibleTo: (organizationId: string, viewer: Viewer): Promise<number> =>
          Promise.resolve(archivedLists(organizationId, viewer).length),
        listVisibleByIds: (
          organizationId: string,
          viewer: Viewer,
          ids: readonly string[],
        ): Promise<ListWithGrants[]> => {
          this.listVisibleByIdsCalls.push(ids);
          return Promise.resolve(
            visibleLists(
              organizationId,
              viewer,
              [...lists.values()]
                .filter((row: TaskListState): boolean => ids.includes(row.id))
                .sort((left: TaskListState, right: TaskListState): number =>
                  left.id.localeCompare(right.id),
                ),
            ),
          );
        },
        findIncludingDeleted: (organizationId: string, id: string): Promise<TaskList | null> => {
          this.reads.push('list');
          return Promise.resolve(findAnyList(organizationId, id));
        },
        lockIncludingDeleted: (
          organizationId: string,
          id: string,
          mode: 'share' | 'update' | 'delete',
        ): Promise<TaskList | null> => {
          this.journal.push(`list ${id}${mode === 'update' ? '' : ` ${mode}`}`);
          return Promise.resolve(findAnyList(organizationId, id));
        },
        markDeletedWithSpace: (
          organizationId: string,
          spaceId: string,
          by: ListActor,
          at: Date,
        ): Promise<readonly string[]> => {
          const marked: string[] = [];
          for (const row of [...lists.values()]) {
            if (row.organizationId !== organizationId || row.spaceId !== spaceId) {
              continue;
            }
            const list: TaskList = TaskList.restore(row);
            const next: TaskList = list.deleteWithSpace(by, at);
            if (next !== list) {
              lists.set(row.id, next.snapshot);
              marked.push(row.id);
            }
          }
          return Promise.resolve(marked);
        },
        listDeletedIdsOfSpace: (organizationId: string, spaceId: string): Promise<string[]> =>
          Promise.resolve(
            [...lists.values()]
              .filter(
                (row: TaskListState): boolean =>
                  row.organizationId === organizationId &&
                  row.spaceId === spaceId &&
                  row.deletedAt !== null,
              )
              .map((row: TaskListState): string => row.id)
              .sort(),
          ),
        anyOfSpace: (organizationId: string, spaceId: string): Promise<boolean> =>
          Promise.resolve(
            [...lists.values()].some(
              (row: TaskListState): boolean =>
                row.organizationId === organizationId && row.spaceId === spaceId,
            ),
          ),
        erase: (organizationId: string, id: string): Promise<void> => {
          const list: TaskList | null = findAnyList(organizationId, id);
          if (!list?.isDeleted) {
            return Promise.reject(new Error('The deleted list to erase is not a tombstone.'));
          }
          if (
            grants.some(
              (grant: FakeGrant): boolean =>
                grant.organizationId === organizationId &&
                grant.resource.kind === 'list' &&
                grant.resource.listId === id,
            )
          ) {
            return Promise.reject(new Error('A foreign key refuses the erasure of the list.'));
          }
          lists.delete(id);
          return Promise.resolve();
        },
        listTrashAccessesVisibleTo: (
          organizationId: string,
          viewer: Viewer,
        ): Promise<TrashListAccess[]> => {
          this.reads.push('trash accesses');
          return Promise.resolve(
            [...lists.values()]
              .map((list: TaskListState) =>
                InMemorySpaces.trashRow(list, spaces, grants, organizationId, viewer),
              )
              .filter((row: ListWithGrants | null): row is ListWithGrants => row !== null)
              .map(toTrashAccess),
          );
        },
        findTrashAccessVisibleTo: (
          organizationId: string,
          viewer: Viewer,
          id: string,
        ): Promise<TrashListAccess | null> => {
          this.reads.push('trash access');
          const list: TaskListState | undefined = lists.get(id);
          const row: ListWithGrants | null =
            list === undefined
              ? null
              : InMemorySpaces.trashRow(list, spaces, grants, organizationId, viewer);
          return Promise.resolve(row === null ? null : toTrashAccess(row));
        },
      },
      grants: {
        viewerGrants: (
          organizationId: string,
          viewerUserId: string,
          spaceId: string,
          listId: string | null,
        ): Promise<ViewerGrants> => {
          this.viewerGrantsCalls.push({ viewerUserId, spaceId, listId });
          this.reads.push('grants');
          return Promise.resolve({
            space: InMemorySpaces.roleOfGrant(
              grants,
              organizationId,
              { kind: 'space', spaceId },
              viewerUserId,
            ),
            list:
              listId === null
                ? null
                : InMemorySpaces.roleOfGrant(
                    grants,
                    organizationId,
                    { kind: 'list', spaceId, listId },
                    viewerUserId,
                  ),
            anyList: InMemorySpaces.anyListGrant(
              grants,
              lists,
              organizationId,
              spaceId,
              viewerUserId,
            ),
          });
        },
        listOf: (organizationId: string, resource: GrantedResource): Promise<StoredGrant[]> =>
          Promise.resolve(
            grants
              .filter(
                (grant: FakeGrant): boolean =>
                  grant.organizationId === organizationId &&
                  InMemorySpaces.sameResource(grant.resource, resource),
              )
              .sort(
                (left: FakeGrant, right: FakeGrant): number =>
                  left.createdAt.getTime() - right.createdAt.getTime() ||
                  left.userId.localeCompare(right.userId),
              )
              .map((grant: FakeGrant): StoredGrant => ({
                userId: grant.userId,
                role: grant.role,
                createdAt: grant.createdAt,
                grantedAt: grant.grantedAt,
                grantedBy: grant.grantedBy,
              })),
          ),
        put: (
          organizationId: string,
          resource: GrantedResource,
          userId: string,
          role: AccessRole,
          actor: EventActor,
        ): Promise<StoredGrant> => {
          const now: Date = this.nextInstant();
          const current: FakeGrant | undefined = grants.find(
            (grant: FakeGrant): boolean =>
              grant.organizationId === organizationId &&
              grant.userId === userId &&
              InMemorySpaces.sameResource(grant.resource, resource),
          );
          const stored: FakeGrant = {
            organizationId,
            resource,
            userId,
            role,
            createdAt: current?.createdAt ?? now,
            grantedAt: now,
            grantedBy: actor,
          };
          grants =
            current === undefined
              ? [...grants, stored]
              : grants.map((grant: FakeGrant): FakeGrant => (grant === current ? stored : grant));
          return Promise.resolve({
            userId,
            role,
            createdAt: stored.createdAt,
            grantedAt: stored.grantedAt,
            grantedBy: actor,
          });
        },
        remove: (
          organizationId: string,
          resource: GrantedResource,
          userId: string,
        ): Promise<void> => {
          grants = grants.filter(
            (grant: FakeGrant): boolean =>
              !(
                grant.organizationId === organizationId &&
                grant.userId === userId &&
                InMemorySpaces.sameResource(grant.resource, resource)
              ),
          );
          return Promise.resolve();
        },
        listOfMember: (
          organizationId: string,
          userId: string,
          limit: number,
        ): Promise<GrantedResource[]> => {
          const held: FakeGrant[] = grants.filter(
            (grant: FakeGrant): boolean =>
              grant.organizationId === organizationId && grant.userId === userId,
          );
          const ofSpaces: GrantedResource[] = held
            .filter((grant: FakeGrant): boolean => grant.resource.kind === 'space')
            .map((grant: FakeGrant): GrantedResource => grant.resource)
            .sort((left: GrantedResource, right: GrantedResource): number =>
              left.spaceId.localeCompare(right.spaceId),
            );
          const ofLists: GrantedResource[] = held
            .filter((grant: FakeGrant): boolean => grant.resource.kind === 'list')
            .map((grant: FakeGrant): GrantedResource => grant.resource)
            .sort(
              (left: GrantedResource, right: GrantedResource): number =>
                left.spaceId.localeCompare(right.spaceId) ||
                (left.kind === 'list' && right.kind === 'list'
                  ? left.listId.localeCompare(right.listId)
                  : 0),
            );
          return Promise.resolve([...ofSpaces, ...ofLists].slice(0, limit));
        },
        listOfMemberInSpaces: (
          organizationId: string,
          userId: string,
          spaceIds: readonly string[],
        ): Promise<GrantedResource[]> => {
          const held: GrantedResource[] = grants
            .filter(
              (grant: FakeGrant): boolean =>
                grant.organizationId === organizationId &&
                grant.userId === userId &&
                spaceIds.includes(grant.resource.spaceId),
            )
            .map((grant: FakeGrant): GrantedResource => grant.resource);
          return Promise.resolve([
            ...held.filter((resource: GrantedResource): boolean => resource.kind === 'space'),
            ...held.filter((resource: GrantedResource): boolean => resource.kind === 'list'),
          ]);
        },
        eraseOfList: (organizationId: string, listId: string): Promise<number> => {
          const before: number = grants.length;
          grants = grants.filter(
            (grant: FakeGrant): boolean =>
              !(
                grant.organizationId === organizationId &&
                grant.resource.kind === 'list' &&
                grant.resource.listId === listId
              ),
          );
          return Promise.resolve(before - grants.length);
        },
        eraseOfSpace: (organizationId: string, spaceId: string): Promise<number> => {
          const before: number = grants.length;
          grants = grants.filter(
            (grant: FakeGrant): boolean =>
              !(
                grant.organizationId === organizationId &&
                grant.resource.kind === 'space' &&
                grant.resource.spaceId === spaceId
              ),
          );
          return Promise.resolve(before - grants.length);
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
        listArchived: (list: TaskList, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'listArchived',
            listId: list.snapshot.id,
            version: list.snapshot.version,
            archivedAt: list.snapshot.archivedAt,
            actor,
          });
          return Promise.resolve();
        },
        listUnarchived: (list: TaskList, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'listUnarchived',
            listId: list.snapshot.id,
            version: list.snapshot.version,
            restoredAt: list.snapshot.restoredAt,
            actor,
          });
          return Promise.resolve();
        },
        spaceAccessChanged: (
          space: Space,
          entries: readonly GrantEntry[],
          changedUserIds: readonly string[],
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'spaceAccessChanged',
            spaceId: space.snapshot.id,
            version: space.snapshot.version,
            grants: entries,
            changedUserIds,
            actor,
          });
          return Promise.resolve();
        },
        listAccessChanged: (
          list: TaskList,
          entries: readonly GrantEntry[],
          changed: readonly ('grants' | 'organizationAccess')[],
          changedUserIds: readonly string[],
          actor: EventActor,
        ): Promise<void> => {
          events.push({
            kind: 'listAccessChanged',
            listId: list.snapshot.id,
            spaceId: list.snapshot.spaceId,
            version: list.snapshot.version,
            organizationAccess: list.snapshot.organizationAccess,
            grants: entries,
            changed,
            changedUserIds,
            actor,
          });
          return Promise.resolve();
        },
        spaceDeleted: (space: Space, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'spaceDeleted',
            spaceId: space.snapshot.id,
            version: space.snapshot.version,
            deletedAt: space.snapshot.deletedAt,
            actor,
          });
          return Promise.resolve();
        },
        spaceRestored: (space: Space, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'spaceRestored',
            spaceId: space.snapshot.id,
            version: space.snapshot.version,
            restoredAt: space.snapshot.restoredAt,
            actor,
          });
          return Promise.resolve();
        },
        listDeleted: (list: TaskList, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'listDeleted',
            listId: list.snapshot.id,
            spaceId: list.snapshot.spaceId,
            version: list.snapshot.version,
            deletedAt: list.snapshot.deletedAt,
            actor,
          });
          return Promise.resolve();
        },
        listRestored: (list: TaskList, actor: EventActor): Promise<void> => {
          events.push({
            kind: 'listRestored',
            listId: list.snapshot.id,
            version: list.snapshot.version,
            restoredAt: list.snapshot.restoredAt,
            archivedAt: list.snapshot.archivedAt,
            actor,
          });
          return Promise.resolve();
        },
      },
      clock: {
        now: (): Promise<Date> => {
          this.clockReads += 1;
          return Promise.resolve(this.now);
        },
      },
      trashQueue: {
        enqueue: (
          deletion:
            | { readonly kind: 'list'; readonly listId: string; readonly version: number }
            | { readonly kind: 'space'; readonly spaceId: string; readonly version: number },
        ): Promise<boolean> => {
          const occurrenceKey: string =
            deletion.kind === 'list'
              ? `list:${deletion.listId}:${String(deletion.version)}`
              : `space:${deletion.spaceId}:${String(deletion.version)}`;
          if (jobs.some((job: RecordedTrashJob): boolean => job.occurrenceKey === occurrenceKey)) {
            return Promise.resolve(false);
          }
          jobs.push({
            payload:
              deletion.kind === 'list'
                ? { listId: deletion.listId }
                : { spaceId: deletion.spaceId },
            occurrenceKey,
          });
          return Promise.resolve(true);
        },
      },
      libraryCleanup: {
        removeListViews: (organizationId: string, targetIds: readonly string[]): Promise<void> => {
          if (this.libraryCleanupError !== null) return Promise.reject(this.libraryCleanupError);
          libraryCleanupCalls.push({ operation: 'views', organizationId, targetIds });
          return Promise.resolve();
        },
        removeSpaceTemplates: (organizationId: string, spaceId: string): Promise<void> => {
          if (this.libraryCleanupError !== null) return Promise.reject(this.libraryCleanupError);
          libraryCleanupCalls.push({
            operation: 'templates',
            organizationId,
            targetIds: [spaceId],
          });
          return Promise.resolve();
        },
        purgeTargetFavorites: (
          organizationId: string,
          kind: 'list' | 'space',
          targetIds: readonly string[],
        ): Promise<void> => {
          if (this.libraryCleanupError !== null) return Promise.reject(this.libraryCleanupError);
          libraryCleanupCalls.push({ operation: 'favorites', organizationId, kind, targetIds });
          return Promise.resolve();
        },
      },
    };
    const result: TResult = await work(store);
    this.spaces = spaces;
    this.lists = lists;
    this.grants = grants;
    this.prefixOwners = prefixOwners;
    this.lastNumbers = lastNumbers;
    this.events = events;
    this.jobs = jobs;
    this.libraryCleanupCalls = libraryCleanupCalls;
    return result;
  }

  /**
   * Method grantsOf
   *
   * @description
   * The committed grants of a space or a list, as `{ userId, role }`, in the order of the store.
   *
   * @param {GrantedResource} resource - The space or the list.
   * @returns {GrantEntry[]} Its grants.
   */
  public grantsOf(resource: GrantedResource): GrantEntry[] {
    return this.grants
      .filter((grant: FakeGrant): boolean => InMemorySpaces.sameResource(grant.resource, resource))
      .map((grant: FakeGrant): GrantEntry => ({ userId: grant.userId, role: grant.role }));
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
   * Method nextInstant
   *
   * @description
   * Gives the instant of the row the fake writes: one second after the previous one.
   *
   * @returns {Date} The instant.
   */
  private nextInstant(): Date {
    return new Date(FIRST_CREATION + this.sequence * 1000);
  }
  // #endregion
}

/** The writes of the trash served (`TRASH_WRITES_ENABLED=true`). */
export const TRASH_WRITES_ON: TrashWrites = Object.freeze({ isEnabled: (): boolean => true });

/** The writes of the trash off, the default (`TRASH_WRITES_ENABLED=false`). */
export const TRASH_WRITES_OFF: TrashWrites = Object.freeze({ isEnabled: (): boolean => false });

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
