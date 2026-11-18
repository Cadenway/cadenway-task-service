import { beforeEach, describe, expect, it } from 'vitest';

import type { MembershipCopy } from '../../../../ports/outbound/members/membership/membership-copy.port.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { MemberEventUnitOfWork } from '../../../../ports/outbound/transactions/membership/member-event-unit-of-work.port.js';
import type { ApplyMemberEventInput } from './apply-member-event.input.js';
import { ApplyMemberEvent } from './apply-member-event.use-case.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), a member of Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** Membership of Hugo Dubois in Atelier Nord. */
const HUGO_MEMBERSHIP: string = '019a6b10-0000-7000-8000-000000000003';

/**
 * Builds a member event of Hugo Dubois in Atelier Nord.
 *
 * @param {ApplyMemberEventInput['kind']} kind - Which event.
 * @param {number} version - Version of the membership after the change.
 * @returns {ApplyMemberEventInput} The event.
 */
function memberEvent(kind: ApplyMemberEventInput['kind'], version: number): ApplyMemberEventInput {
  return {
    kind,
    memberId: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role: 'member',
    version,
    occurredAt: new Date('2026-11-03T08:30:00Z'),
  };
}

/** Records, in order, what the use case asked of both ports. */
class RecordingPorts implements MembershipCopy, PrivateSpaceHandover {
  // #region Properties
  /**
   * Property calls
   *
   * @description
   * The calls, in the order they were made.
   *
   * @type {string[]}
   * @readonly
   */
  public readonly calls: string[] = [];

  /**
   * Property failure
   *
   * @description
   * The error the copy throws, or `null` for none.
   *
   * @type {Error | null}
   */
  public failure: Error | null = null;
  // #endregion

  // #region Methods
  /**
   * Method apply
   *
   * @description
   * Records the change, or throws the failure.
   *
   * @param {ApplyMemberEventInput} change - The member event.
   * @returns {Promise<void>} Resolves once recorded.
   */
  public apply(change: ApplyMemberEventInput): Promise<void> {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    this.calls.push(`apply:${change.kind}:${String(change.version)}`);
    return Promise.resolve();
  }

  /**
   * Method handOver
   *
   * @description
   * Records the hand-over.
   *
   * @param {string} organizationId - The organization.
   * @param {string} formerOwnerUserId - The account of the former member.
   * @returns {Promise<void>} Resolves once recorded.
   */
  public handOver(organizationId: string, formerOwnerUserId: string): Promise<void> {
    this.calls.push(`handOver:${organizationId}:${formerOwnerUserId}`);
    return Promise.resolve();
  }
  // #endregion
}

describe('ApplyMemberEvent: the member events drive the copy, then the private spaces', () => {
  let ports: RecordingPorts;
  let useCase: ApplyMemberEvent;

  beforeEach(() => {
    ports = new RecordingPorts();
    useCase = new ApplyMemberEvent(
      { run: <TResult>(work: () => Promise<TResult>): Promise<TResult> => work() },
      ports,
      ports,
    );
  });

  it('applies a join to the copy only', async () => {
    await useCase.execute(memberEvent('joined', 1));

    expect(ports.calls).toEqual(['apply:joined:1']);
  });

  it('applies a role change to the copy only, the member keeping the spaces they own', async () => {
    await useCase.execute(memberEvent('role-changed', 2));

    expect(ports.calls).toEqual(['apply:role-changed:2']);
  });

  it('applies a removal to the copy first, then hands the private spaces of the member over', async () => {
    await useCase.execute(memberEvent('removed', 3));

    expect(ports.calls).toEqual(['apply:removed:3', `handOver:${ATELIER_NORD}:${HUGO}`]);
  });

  it('hands nothing over when the copy refuses the removal, so the event is redelivered', async () => {
    ports.failure = new Error('The membership names another account.');

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toThrow(ports.failure);
    expect(ports.calls).toEqual([]);
  });
});

/** What the use case did, in order, with a unit of work that records where it begins and ends. */
interface TracedPorts {
  // #region Properties
  /**
   * Property log
   *
   * @description
   * The steps, in order: `begin`, the port calls, then `commit` or `rollback`.
   *
   * @type {string[]}
   * @readonly
   */
  readonly log: string[];

  /**
   * Property useCase
   *
   * @description
   * The use case under test, wired on the traced ports.
   *
   * @type {ApplyMemberEvent}
   * @readonly
   */
  readonly useCase: ApplyMemberEvent;
  // #endregion
}

/**
 * Wires the use case on a unit of work and two ports that write to one log.
 *
 * @param failures - The port calls that must throw, by step name (`apply` or `handOver`).
 * @returns The log and the use case.
 */
function traced(
  failures: Readonly<Partial<Record<'apply' | 'handOver', Error>>> = {},
): TracedPorts {
  const log: string[] = [];
  const unitOfWork: MemberEventUnitOfWork = {
    run: async <TResult>(work: () => Promise<TResult>): Promise<TResult> => {
      log.push('begin');
      try {
        const result: TResult = await work();
        log.push('commit');
        return result;
      } catch (error: unknown) {
        log.push('rollback');
        throw error;
      }
    },
  };
  const ports: MembershipCopy & PrivateSpaceHandover = {
    apply: (change: ApplyMemberEventInput): Promise<void> => {
      log.push(`apply:${change.kind}`);
      return failures.apply === undefined ? Promise.resolve() : Promise.reject(failures.apply);
    },
    handOver: (): Promise<void> => {
      log.push('handOver');
      return failures.handOver === undefined
        ? Promise.resolve()
        : Promise.reject(failures.handOver);
    },
  };
  return { log, useCase: new ApplyMemberEvent(unitOfWork, ports, ports) };
}

describe('ApplyMemberEvent: the copy and the hand-over of the private spaces are one unit of work', () => {
  it('runs a join inside the unit of work, which commits it', async () => {
    const { log, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1));

    expect(log).toEqual(['begin', 'apply:joined', 'commit']);
  });

  it('runs the copy and the hand-over of a removal inside the same unit of work', async () => {
    const { log, useCase } = traced();

    await useCase.execute(memberEvent('removed', 3));

    expect(log).toEqual(['begin', 'apply:removed', 'handOver', 'commit']);
  });

  it('rejects the run when the hand-over fails, and the unit of work rolls the copy back', async () => {
    const failure = new Error('The owner of the organization is not known yet.');
    const { log, useCase } = traced({ handOver: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toBe(failure);

    expect(log).toEqual(['begin', 'apply:removed', 'handOver', 'rollback']);
  });

  it('rejects the run when the copy fails, without handing anything over', async () => {
    const failure = new Error('The membership names another account.');
    const { log, useCase } = traced({ apply: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toBe(failure);

    expect(log).toEqual(['begin', 'apply:removed', 'rollback']);
  });

  it('does not let a failing hand-over touch an event that hands nothing over', async () => {
    const { log, useCase } = traced({ handOver: new Error('never called') });

    await useCase.execute(memberEvent('role-changed', 2));

    expect(log).toEqual(['begin', 'apply:role-changed', 'commit']);
  });

  it('opens one unit of work per event', async () => {
    const { log, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1));
    await useCase.execute(memberEvent('removed', 3));

    expect(log.filter((step: string) => step === 'begin')).toHaveLength(2);
    expect(log.filter((step: string) => step === 'commit')).toHaveLength(2);
  });
});
