import { Membership } from '../../domain/aggregates/membership/membership.aggregate.js';
import type { MembershipChange } from '../../domain/value-objects/membership/membership-change.value-object.js';
import type { MembershipState } from '../../domain/value-objects/membership/membership-state.value-object.js';
import type { MembershipRepository } from '../ports/outbound/persistence/membership/membership-repository.port.js';
import type { MembershipsUnitOfWork } from '../ports/outbound/transactions/membership/memberships-unit-of-work.port.js';

/** Organization "Atelier Nord". */
export const ATELIER_NORD = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Another organization than Atelier Nord. */
export const OTHER_ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b99';

/** Account of Camille Martin (CM), the owner of Atelier Nord. */
export const CAMILLE = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';

/** Account of Inès Robert (IR), an admin of Atelier Nord. */
export const INES = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b31';

/** Account of Hugo Dubois (HD), a member of Atelier Nord. */
export const HUGO = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Account of Léa Petit (LP), a guest of Atelier Nord. */
export const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/** Membership of Camille Martin in Atelier Nord. */
export const CAMILLE_MEMBERSHIP = '019a6b10-0000-7000-8000-000000000001';

/** Membership of Inès Robert in Atelier Nord. */
export const INES_MEMBERSHIP = '019a6b10-0000-7000-8000-000000000002';

/** Membership of Hugo Dubois in Atelier Nord. */
export const HUGO_MEMBERSHIP = '019a6b10-0000-7000-8000-000000000003';

/** Membership of Léa Petit in Atelier Nord. */
export const LEA_MEMBERSHIP = '019a6b10-0000-7000-8000-000000000004';

/** When organization-service committed the changes of the specs. */
export const OCCURRED_AT: Date = new Date('2026-11-03T08:30:00Z');

/**
 * Builds a stored state of the membership of Hugo Dubois in Atelier Nord.
 *
 * @param overrides - Fields to replace.
 * @returns The state.
 */
export function membershipState(overrides: Partial<MembershipState> = {}): MembershipState {
  return {
    id: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role: 'member',
    version: 1,
    removedAt: null,
    ...overrides,
  };
}

/**
 * Builds an event of the membership of Hugo Dubois in Atelier Nord.
 *
 * @param kind - Which event.
 * @param version - Version after the change.
 * @param overrides - Fields to replace.
 * @returns The event.
 */
export function membershipChange(
  kind: MembershipChange['kind'],
  version: number,
  overrides: Partial<MembershipChange> = {},
): MembershipChange {
  return {
    kind,
    memberId: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role: 'member',
    version,
    occurredAt: OCCURRED_AT,
    ...overrides,
  };
}

/**
 * Class InMemoryMemberships
 *
 * @description
 * A fake `MembershipsUnitOfWork` holding the copy in memory, with no database: the work runs on a
 * copy of the rows that is committed only when it resolves, as the tenant transaction is. It
 * records every call of the repository, and can simulate a concurrent event that stored the row
 * between the lock and the insert.
 */
export class InMemoryMemberships implements MembershipsUnitOfWork {
  // #region Properties
  /**
   * Property rows
   *
   * @description
   * The committed memberships by id, in insertion order.
   *
   * @type {Map<string, MembershipState>}
   */
  public rows: Map<string, MembershipState>;

  /**
   * Property locks
   *
   * @description
   * The `lock` calls, as organization and id.
   *
   * @type {{ organizationId: string; id: string }[]}
   * @readonly
   */
  public readonly locks: { readonly organizationId: string; readonly id: string }[] = [];

  /**
   * Property inserts
   *
   * @description
   * The states passed to `insertIfAbsent`, whether stored or not.
   *
   * @type {MembershipState[]}
   * @readonly
   */
  public readonly inserts: MembershipState[] = [];

  /**
   * Property updates
   *
   * @description
   * The states passed to `update`.
   *
   * @type {MembershipState[]}
   * @readonly
   */
  public readonly updates: MembershipState[] = [];

  /**
   * Property activeByUserCalls
   *
   * @description
   * The `listActiveByUser` calls, as organization and account.
   *
   * @type {{ organizationId: string; userId: string }[]}
   * @readonly
   */
  public readonly activeByUserLocks: boolean[] = [];

  /**
   * Property activeByUserCalls
   *
   * @description
   * The `listActiveByUser` calls, as organization and account (their `lock` is in
   * `activeByUserLocks`).
   *
   * @type {{ organizationId: string; userId: string }[]}
   * @readonly
   */
  public readonly activeByUserCalls: {
    readonly organizationId: string;
    readonly userId: string;
  }[] = [];

  /**
   * Property activeOwnerCalls
   *
   * @description
   * The organizations `findActiveOwner` was called with.
   *
   * @type {string[]}
   * @readonly
   */
  public readonly activeOwnerCalls: string[] = [];

  /**
   * Property racingRow
   *
   * @description
   * A row a concurrent transaction stores just before the next `insertIfAbsent`, which then
   * returns `false`; `null` for no race.
   *
   * @type {MembershipState | null}
   */
  public racingRow: MembershipState | null = null;

  /**
   * Property loseInsertWithoutRow
   *
   * @description
   * Makes `insertIfAbsent` return `false` although no row exists: the row of a lost race that
   * cannot be read back.
   *
   * @type {boolean}
   */
  public loseInsertWithoutRow: boolean = false;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Starts with committed rows.
   *
   * @param {readonly MembershipState[]} initial - The memberships already stored.
   * @constructor
   */
  public constructor(initial: readonly MembershipState[] = []) {
    this.rows = new Map<string, MembershipState>(
      initial.map((row: MembershipState): [string, MembershipState] => [row.id, row]),
    );
  }
  // #endregion

  // #region Methods
  /**
   * Method run
   *
   * @description
   * Runs the work on a copy of the rows, committed when it resolves and dropped when it rejects.
   *
   * @param {(memberships: MembershipRepository) => Promise<TResult>} work - The unit of work.
   * @returns {Promise<TResult>} What the work resolved with.
   */
  public async run<TResult>(
    work: (memberships: MembershipRepository) => Promise<TResult>,
  ): Promise<TResult> {
    const rows: Map<string, MembershipState> = new Map<string, MembershipState>(this.rows);
    const repository: MembershipRepository = {
      lock: (organizationId: string, id: string): Promise<Membership | null> => {
        this.locks.push({ organizationId, id });
        const state: MembershipState | undefined = rows.get(id);
        return Promise.resolve(
          state?.organizationId === organizationId ? Membership.restore(state) : null,
        );
      },
      insertIfAbsent: (membership: Membership): Promise<boolean> => {
        this.inserts.push(membership.snapshot);
        if (this.racingRow !== null) {
          rows.set(this.racingRow.id, this.racingRow);
          this.racingRow = null;
          return Promise.resolve(false);
        }
        if (this.loseInsertWithoutRow || rows.has(membership.snapshot.id)) {
          return Promise.resolve(false);
        }
        rows.set(membership.snapshot.id, membership.snapshot);
        return Promise.resolve(true);
      },
      update: (membership: Membership): Promise<void> => {
        this.updates.push(membership.snapshot);
        rows.set(membership.snapshot.id, membership.snapshot);
        return Promise.resolve();
      },
      listActiveByUser: (
        organizationId: string,
        userId: string,
        lock: boolean,
      ): Promise<Membership[]> => {
        this.activeByUserLocks.push(lock);
        this.activeByUserCalls.push({ organizationId, userId });
        const states: MembershipState[] = [...rows.values()]
          .filter(
            (row: MembershipState): boolean =>
              row.organizationId === organizationId &&
              row.userId === userId &&
              row.removedAt === null,
          )
          .reverse();
        return Promise.resolve(
          states.map((state: MembershipState): Membership => Membership.restore(state)),
        );
      },
      findActiveOwner: (organizationId: string): Promise<Membership | null> => {
        this.activeOwnerCalls.push(organizationId);
        const state: MembershipState | undefined = [...rows.values()].find(
          (row: MembershipState): boolean =>
            row.organizationId === organizationId && row.role === 'owner' && row.removedAt === null,
        );
        return Promise.resolve(state === undefined ? null : Membership.restore(state));
      },
    };
    const result: TResult = await work(repository);
    this.rows = rows;
    return result;
  }
  // #endregion
}
