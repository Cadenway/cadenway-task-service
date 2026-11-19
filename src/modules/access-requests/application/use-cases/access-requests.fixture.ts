import { AccessRequest } from '../../domain/aggregates/access-request/access-request.aggregate.js';
import type { AccessRole } from '../../domain/value-objects/access/access-role.value-object.js';
import type { AccessRequestDraft } from '../../domain/value-objects/access-request/access-request-draft.value-object.js';
import type { AccessRequestState } from '../../domain/value-objects/access-request/access-request-state.value-object.js';
import type { MemberRole } from '../../domain/value-objects/member/member-role.value-object.js';
import {
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DIR_12,
  DIRECTION,
  HUGO,
  INES,
  LEA,
  RECRUTEMENT,
} from '../../domain/access-requests.fixture.js';
import type { PendingScope } from '../models/access-request/pending-scope.model.js';
import type { RequestedTarget } from '../models/access-request/requested-target.model.js';
import type { GrantOutcome } from '../models/grant/grant-outcome.model.js';
import type { GrantRequest } from '../models/grant/grant-request.model.js';
import type { PagePosition } from '../models/page/page-position.model.js';
import type { ManagedTargets } from '../models/target/managed-targets.model.js';
import type { TargetAccess } from '../models/target/target-access.model.js';
import type { TargetRef } from '../models/target/target-ref.model.js';
import type { TaskReference } from '../models/task/task-reference.model.js';
import type { AccessRequestsStore } from '../models/transactions/access-requests-store.model.js';
import type { MemberDirectory } from '../ports/outbound/members/membership/member-directory.port.js';
import type { AccessTargets } from '../ports/outbound/spaces/access/access-targets.port.js';
import type { TaskReferences } from '../ports/outbound/tasks/task/task-references.port.js';
import type { AccessRequestsUnitOfWork } from '../ports/outbound/transactions/access-request/access-requests-unit-of-work.port.js';

export {
  ASKED_AT,
  ATELIER_NORD,
  BUDGET,
  CAMILLE,
  DECIDED_AT,
  DIR_12,
  DIRECTION,
  HUGO,
  INES,
  LEA,
  LIST_REQUEST,
  OTHER_ORGANIZATION,
  RECRUTEMENT,
  SPACE_REQUEST,
  TASK_REQUEST,
  listRequestState,
  spaceRequestState,
  taskRequestState,
} from '../../domain/access-requests.fixture.js';

/** A request id no request has. */
export const UNKNOWN_REQUEST = '019a7007-0000-7000-8000-0000000000ff';

/** A space id no space has. */
export const UNKNOWN_SPACE = '019a7000-0000-7000-8000-0000000000ff';

/** The instant of the transactions of a spec, 12:00 on 8 November 2026. */
export const NOW: Date = new Date('2026-11-08T12:00:00.000Z');

/** An event appended by a use case, as the fake outbox records it. */
export type RecordedEvent =
  | {
      readonly kind: 'accessRequested';
      readonly requestId: string;
      readonly target: string;
      readonly version: number;
      readonly names: RequestedTarget;
    }
  | {
      readonly kind: 'accessRequestDecided';
      readonly requestId: string;
      readonly target: string;
      readonly version: number;
      readonly status: string;
      readonly role: AccessRole | null;
      readonly decidedById: string | null;
    };

/** An attempt of the hourly limit, as the fake stores it. */
interface StoredAttempt {
  // #region Properties
  /** The organization. */
  readonly organizationId: string;

  /** The requester. */
  readonly userId: string;

  /** When. */
  readonly at: Date;
  // #endregion
}

/**
 * Whether a pending request is in a scope, as the SQL of the repository decides it.
 *
 * @param state - The request.
 * @param scope - The scope.
 * @returns `true` when the scope keeps it.
 */
function inScope(state: AccessRequestState, scope: PendingScope): boolean {
  const answered: boolean =
    state.target === 'space'
      ? scope.spaceIds.includes(state.spaceId)
      : state.listId !== null && scope.listIds.includes(state.listId);
  return (
    state.status === 'pending' &&
    answered &&
    (scope.spaceId === null || state.spaceId === scope.spaceId) &&
    (scope.listId === null || state.listId === scope.listId)
  );
}

/**
 * Orders requests the most recent first, the id breaking the ties.
 *
 * @param left - One request.
 * @param right - The other.
 * @returns The order.
 */
function newestFirst(left: AccessRequestState, right: AccessRequestState): number {
  const byInstant: number = right.createdAt.getTime() - left.createdAt.getTime();
  return byInstant !== 0 ? byInstant : right.id.localeCompare(left.id);
}

/**
 * A fake unit of work over requests and attempts in memory, with the rules of the tables: one
 * pending request per requester and target, the order of the listing, and a rollback of every
 * write of a run that rejects. It records the calls of the store in order.
 */
export class InMemoryAccessRequests implements AccessRequestsUnitOfWork {
  // #region Properties
  /** The requests by id. */
  public requests: Map<string, AccessRequestState> = new Map<string, AccessRequestState>();

  /** The attempts of the hourly limit. */
  public attempts: StoredAttempt[] = [];

  /** The events appended by committed runs. */
  public events: RecordedEvent[] = [];

  /** The calls of the store, in order. */
  public readonly calls: string[] = [];

  /** The kind of each run, in order. */
  public readonly runs: ('read-write' | 'read-only')[] = [];

  /** The instant of the transactions. */
  public now: Date = NOW;

  /** How many requests were inserted, for their ids. */
  private inserted: number = 0;
  // #endregion

  // #region Constructor
  /**
   * Seeds the fake.
   *
   * @param requests - The stored requests.
   * @param attempts - The instants of the attempts of each requester of Atelier Nord.
   */
  public constructor(
    requests: readonly AccessRequestState[] = [],
    attempts: readonly { readonly userId: string; readonly at: Date }[] = [],
  ) {
    for (const request of requests) {
      this.requests.set(request.id, request);
    }
    this.attempts = attempts.map((attempt) => ({ organizationId: ATELIER_NORD, ...attempt }));
  }
  // #endregion

  // #region Methods
  /**
   * Runs the work in a read-write run.
   *
   * @param work - The unit of work.
   * @returns What it resolved with.
   */
  public run<TResult>(work: (store: AccessRequestsStore) => Promise<TResult>): Promise<TResult> {
    this.runs.push('read-write');
    return this.execute(work, false);
  }

  /**
   * Runs the work in a read-only run, where a write fails.
   *
   * @param work - The read.
   * @returns What it resolved with.
   */
  public runReadOnly<TResult>(
    work: (store: AccessRequestsStore) => Promise<TResult>,
  ): Promise<TResult> {
    this.runs.push('read-only');
    return this.execute(work, true);
  }

  /**
   * The attempts of one requester of Atelier Nord.
   *
   * @param userId - The requester.
   * @returns Their instants.
   */
  public attemptsOf(userId: string): readonly Date[] {
    return this.attempts
      .filter((attempt) => attempt.organizationId === ATELIER_NORD && attempt.userId === userId)
      .map((attempt) => attempt.at);
  }

  /**
   * The pending requests of the fake.
   *
   * @returns Their states.
   */
  public pending(): readonly AccessRequestState[] {
    return [...this.requests.values()].filter((request) => request.status === 'pending');
  }

  /**
   * Runs the work on a store, and restores every write when it rejects.
   *
   * @param work - The work.
   * @param readOnly - Whether a write fails.
   * @returns What it resolved with.
   */
  private async execute<TResult>(
    work: (store: AccessRequestsStore) => Promise<TResult>,
    readOnly: boolean,
  ): Promise<TResult> {
    const requests = new Map(this.requests);
    const attempts = [...this.attempts];
    const events: RecordedEvent[] = [];
    try {
      const result: TResult = await work(this.storeOf(readOnly, events));
      this.events.push(...events);
      return result;
    } catch (error: unknown) {
      this.requests = requests;
      this.attempts = attempts;
      throw error;
    }
  }

  /**
   * Builds the store of one run.
   *
   * @param readOnly - Whether a write fails.
   * @param events - Where the events of the run go until it commits.
   * @returns The store.
   */
  private storeOf(readOnly: boolean, events: RecordedEvent[]): AccessRequestsStore {
    const write = (call: string): void => {
      if (readOnly) {
        throw new Error(`A read-only run wrote: ${call}.`);
      }
      this.calls.push(call);
    };
    return {
      requests: {
        insertPending: (draft: AccessRequestDraft) => {
          write('requests.insertPending');
          const taken: boolean = [...this.requests.values()].some(
            (stored) =>
              stored.status === 'pending' &&
              stored.organizationId === draft.organizationId &&
              stored.requesterUserId === draft.requesterUserId &&
              stored.target === draft.target &&
              stored.targetId === draft.targetId,
          );
          if (taken) {
            return Promise.resolve(null);
          }
          this.inserted += 1;
          const state: AccessRequestState = {
            ...draft,
            id: `019a7007-1111-7000-8000-${String(this.inserted).padStart(12, '0')}`,
            status: 'pending',
            role: null,
            createdAt: this.now,
            decidedAt: null,
            decidedBy: null,
          };
          this.requests.set(state.id, state);
          return Promise.resolve(AccessRequest.restore(state));
        },
        lock: (organizationId: string, id: string) => {
          this.calls.push(`requests.lock:${id}`);
          const state: AccessRequestState | undefined = this.requests.get(id);
          return Promise.resolve(
            state?.organizationId === organizationId ? AccessRequest.restore(state) : null,
          );
        },
        saveDecision: (request: AccessRequest) => {
          write('requests.saveDecision');
          const stored: AccessRequestState | undefined = this.requests.get(request.snapshot.id);
          if (stored?.status !== 'pending') {
            return Promise.reject(new Error('The request is no longer pending.'));
          }
          this.requests.set(request.snapshot.id, request.snapshot);
          return Promise.resolve();
        },
        listPending: (
          organizationId: string,
          scope: PendingScope,
          after: PagePosition | null,
          limit: number,
        ) => {
          this.calls.push('requests.listPending');
          const rows: AccessRequest[] = [...this.requests.values()]
            .filter((state) => state.organizationId === organizationId && inScope(state, scope))
            .sort(newestFirst)
            .filter(
              (state) =>
                after === null ||
                state.createdAt.getTime() < after.createdAt.getTime() ||
                (state.createdAt.getTime() === after.createdAt.getTime() && state.id < after.id),
            )
            .slice(0, limit)
            .map((state) => AccessRequest.restore(state));
          return Promise.resolve(rows);
        },
        countPending: (organizationId: string, scope: PendingScope) => {
          this.calls.push('requests.countPending');
          return Promise.resolve(
            [...this.requests.values()].filter(
              (state) => state.organizationId === organizationId && inScope(state, scope),
            ).length,
          );
        },
        lockPendingOf: (organizationId: string, requesterUserId: string, limit: number) => {
          this.calls.push('requests.lockPendingOf');
          return Promise.resolve(
            [...this.requests.values()]
              .filter(
                (state) =>
                  state.organizationId === organizationId &&
                  state.requesterUserId === requesterUserId &&
                  state.status === 'pending',
              )
              .map((state) => state.id)
              .sort()
              .slice(0, limit),
          );
        },
        deleteRequests: (organizationId: string, ids: readonly string[]) => {
          write('requests.deleteRequests');
          let deleted: number = 0;
          for (const id of ids) {
            if (this.requests.get(id)?.organizationId === organizationId) {
              this.requests.delete(id);
              deleted += 1;
            }
          }
          return Promise.resolve(deleted);
        },
      },
      attempts: {
        serialize: () => {
          this.calls.push('attempts.serialize');
          return Promise.resolve();
        },
        recent: (organizationId: string, userId: string, after: Date, limit: number) => {
          this.calls.push('attempts.recent');
          return Promise.resolve(
            this.attempts
              .filter(
                (attempt) =>
                  attempt.organizationId === organizationId &&
                  attempt.userId === userId &&
                  attempt.at.getTime() > after.getTime(),
              )
              .map((attempt) => attempt.at)
              .sort((left, right) => right.getTime() - left.getTime())
              .slice(0, limit),
          );
        },
        prune: (organizationId: string, userId: string, upTo: Date) => {
          write('attempts.prune');
          this.attempts = this.attempts.filter(
            (attempt) =>
              attempt.organizationId !== organizationId ||
              attempt.userId !== userId ||
              attempt.at.getTime() > upTo.getTime(),
          );
          return Promise.resolve();
        },
        record: (organizationId: string, userId: string) => {
          write('attempts.record');
          this.attempts.push({ organizationId, userId, at: this.now });
          return Promise.resolve();
        },
        deleteAll: (organizationId: string, userId: string) => {
          write('attempts.deleteAll');
          this.attempts = this.attempts.filter(
            (attempt) => attempt.organizationId !== organizationId || attempt.userId !== userId,
          );
          return Promise.resolve();
        },
      },
      events: {
        accessRequested: (request: AccessRequest, names: RequestedTarget) => {
          write('events.accessRequested');
          events.push({
            kind: 'accessRequested',
            requestId: request.snapshot.id,
            target: request.snapshot.target,
            version: request.version,
            names,
          });
          return Promise.resolve();
        },
        accessRequestDecided: (request: AccessRequest) => {
          write('events.accessRequestDecided');
          events.push({
            kind: 'accessRequestDecided',
            requestId: request.snapshot.id,
            target: request.snapshot.target,
            version: request.version,
            status: request.snapshot.status,
            role: request.snapshot.role,
            decidedById: request.snapshot.decidedBy?.id ?? null,
          });
          return Promise.resolve();
        },
      },
      clock: {
        now: () => {
          this.calls.push('clock.now');
          return Promise.resolve(this.now);
        },
      },
    };
  }
  // #endregion
}

/**
 * A fake copy of the memberships of Atelier Nord: Léa Petit owns "Direction", Camille Martin,
 * Hugo Dubois and Inès Roche are members, unless a spec says otherwise.
 */
export class FakeMembers implements MemberDirectory {
  // #region Properties
  /** The calls, with their lock. */
  public readonly calls: string[] = [];

  /** The role of each member. */
  private readonly roles: Map<string, MemberRole>;
  // #endregion

  // #region Constructor
  /**
   * Seeds the copy.
   *
   * @param roles - Roles to set, `null` to remove a member.
   */
  public constructor(roles: Readonly<Record<string, MemberRole | null>> = {}) {
    this.roles = new Map<string, MemberRole>([
      [LEA, 'member'],
      [CAMILLE, 'member'],
      [HUGO, 'member'],
      [INES, 'member'],
    ]);
    for (const [userId, role] of Object.entries(roles)) {
      if (role === null) {
        this.roles.delete(userId);
      } else {
        this.roles.set(userId, role);
      }
    }
  }
  // #endregion

  // #region Methods
  /**
   * The role of a member of Atelier Nord.
   *
   * @param organizationId - The organization.
   * @param userId - The account.
   * @param lock - Whether the membership is locked.
   * @returns Its role, or `null`.
   */
  public roleOf(organizationId: string, userId: string, lock = false): Promise<MemberRole | null> {
    this.calls.push(`roleOf:${userId}:${lock ? 'share' : 'none'}`);
    return Promise.resolve(
      organizationId === ATELIER_NORD ? (this.roles.get(userId) ?? null) : null,
    );
  }
  // #endregion
}

/** The access of one member on one space or list, as a spec sets it. */
interface Access {
  // #region Properties
  /** Their role on it. */
  readonly role: AccessRole | null;

  /** Whether they answer its requests. */
  readonly manages: boolean;
  // #endregion
}

/**
 * A fake spaces module over "Direction", owned by Léa Petit, with its lists "Budget" and
 * "Recrutement": Léa Petit manages all three with `edit`; nobody else has a role unless a spec
 * gives one.
 */
export class FakeAccessTargets implements AccessTargets {
  // #region Properties
  /** The calls, in order. */
  public readonly calls: string[] = [];

  /** The grants asked for. */
  public readonly grants: GrantRequest[] = [];

  /** What the grant answers. */
  public grantOutcome: GrantOutcome = { outcome: 'granted', changed: true };

  /** The access of each member, by account then target id. */
  private readonly access: Map<string, Map<string, Access>> = new Map<
    string,
    Map<string, Access>
  >();
  // #endregion

  // #region Constructor
  /** Gives Léa Petit the management of "Direction" and its lists. */
  public constructor() {
    this.allow(LEA, DIRECTION, 'edit', true);
    this.allow(LEA, BUDGET, 'edit', true);
    this.allow(LEA, RECRUTEMENT, 'edit', true);
  }
  // #endregion

  // #region Methods
  /**
   * Sets the access of a member on a space or a list.
   *
   * @param userId - The member.
   * @param targetId - The space or the list.
   * @param role - Their role.
   * @param manages - Whether they answer its requests.
   * @returns The fake.
   */
  public allow(
    userId: string,
    targetId: string,
    role: AccessRole | null,
    manages: boolean = role === 'edit',
  ): this {
    const byTarget: Map<string, Access> = this.access.get(userId) ?? new Map<string, Access>();
    byTarget.set(targetId, { role, manages });
    this.access.set(userId, byTarget);
    return this;
  }

  /**
   * Reads a space or a list of Atelier Nord.
   *
   * @param organizationId - The organization.
   * @param viewerUserId - The member.
   * @param _viewerRole - Its role in the organization.
   * @param target - The space or the list.
   * @returns The target, or `null`.
   */
  public find(
    organizationId: string,
    viewerUserId: string,
    _viewerRole: MemberRole,
    target: TargetRef,
  ): Promise<TargetAccess | null> {
    const id: string = target.kind === 'space' ? target.spaceId : target.listId;
    this.calls.push(`find:${target.kind}:${id}`);
    if (organizationId !== ATELIER_NORD) {
      return Promise.resolve(null);
    }
    const access: Access = this.access.get(viewerUserId)?.get(id) ?? {
      role: null,
      manages: false,
    };
    const common = {
      spaceId: DIRECTION,
      spaceName: 'Direction',
      spaceOwnerUserId: LEA,
      viewerRole: access.role,
      viewerManages: access.manages,
    };
    if (target.kind === 'space') {
      return Promise.resolve(
        id === DIRECTION ? { ...common, kind: 'space', listId: null, listName: null } : null,
      );
    }
    const listName: string | undefined = { [BUDGET]: 'Budget', [RECRUTEMENT]: 'Recrutement' }[id];
    return Promise.resolve(
      listName === undefined ? null : { ...common, kind: 'list', listId: id, listName },
    );
  }

  /**
   * Lists what a member answers for.
   *
   * @param organizationId - The organization.
   * @param viewerUserId - The member.
   * @returns The spaces and the lists.
   */
  public listManaged(organizationId: string, viewerUserId: string): Promise<ManagedTargets> {
    this.calls.push(`listManaged:${viewerUserId}`);
    const managed: string[] =
      organizationId === ATELIER_NORD
        ? [...(this.access.get(viewerUserId) ?? new Map<string, Access>()).entries()]
            .filter(([, access]) => access.manages)
            .map(([id]) => id)
        : [];
    return Promise.resolve({
      spaceIds: managed.filter((id) => id === DIRECTION),
      listIds: managed.filter((id) => id !== DIRECTION),
    });
  }

  /**
   * Records the grant and answers the configured outcome.
   *
   * @param request - The grant.
   * @returns The outcome.
   */
  public grant(request: GrantRequest): Promise<GrantOutcome> {
    this.calls.push(`grant:${request.target.kind}`);
    this.grants.push(request);
    return Promise.resolve(this.grantOutcome);
  }
  // #endregion
}

/** DIR-12 "Budget 2027", in "Budget", in progress. */
export const DIR_12_TASK: TaskReference = {
  id: DIR_12,
  key: 'DIR-12',
  name: 'Budget 2027',
  status: 'progress',
  listId: BUDGET,
  spaceId: DIRECTION,
};

/** A fake tasks module that knows DIR-12, unless a spec says otherwise. */
export class FakeTaskReferences implements TaskReferences {
  // #region Properties
  /** The calls, in order. */
  public readonly calls: string[] = [];

  /** The tasks it knows. */
  public tasks: TaskReference[] = [DIR_12_TASK];
  // #endregion

  // #region Methods
  /**
   * Finds a task of Atelier Nord by key.
   *
   * @param organizationId - The organization.
   * @param taskKey - The key.
   * @returns The task, or `null`.
   */
  public findByKey(organizationId: string, taskKey: string): Promise<TaskReference | null> {
    this.calls.push(`findByKey:${taskKey}`);
    return Promise.resolve(
      organizationId === ATELIER_NORD
        ? (this.tasks.find((task) => task.key === taskKey) ?? null)
        : null,
    );
  }

  /**
   * Finds tasks of Atelier Nord by id.
   *
   * @param organizationId - The organization.
   * @param taskIds - The ids.
   * @returns The tasks found.
   */
  public findByIds(
    organizationId: string,
    taskIds: readonly string[],
  ): Promise<readonly TaskReference[]> {
    this.calls.push(`findByIds:${String(taskIds.length)}`);
    return Promise.resolve(
      organizationId === ATELIER_NORD ? this.tasks.filter((task) => taskIds.includes(task.id)) : [],
    );
  }
  // #endregion
}
