import { beforeEach, describe, expect, it } from 'vitest';

import type { MembershipCopy } from '../../../../ports/outbound/members/membership/membership-copy.port.js';
import type { PrivateSpaceHandover } from '../../../../ports/outbound/spaces/space/private-space-handover.port.js';
import type { TaskAssignments } from '../../../../ports/outbound/tasks/assignee/task-assignments.port.js';
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
 * @param {ApplyMemberEventInput['role']} [role] - Role after the change; `member` by default.
 * @returns {ApplyMemberEventInput} The event.
 */
function memberEvent(
  kind: ApplyMemberEventInput['kind'],
  version: number,
  role: ApplyMemberEventInput['role'] = 'member',
): ApplyMemberEventInput {
  return {
    kind,
    memberId: HUGO_MEMBERSHIP,
    organizationId: ATELIER_NORD,
    userId: HUGO,
    role,
    version,
    occurredAt: new Date('2026-11-03T08:30:00Z'),
  };
}

/** Records, in order, what the use case asked of its three ports. */
class RecordingPorts implements MembershipCopy, PrivateSpaceHandover, TaskAssignments {
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

  /**
   * Property awaiting
   *
   * @description
   * How many private spaces the hand-over reports as awaiting an owner.
   *
   * @type {number}
   */
  public awaiting: number = 0;

  /**
   * Property unassigned
   *
   * @description
   * How many tasks the unassignment reports.
   *
   * @type {number}
   */
  public unassigned: number = 0;
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
   * Records the hand-over and reports how many spaces await an owner.
   *
   * @param {string} organizationId - The organization.
   * @param {string} formerOwnerUserId - The account of the former member.
   * @returns {Promise<number>} The configured count.
   */
  public handOver(organizationId: string, formerOwnerUserId: string): Promise<number> {
    this.calls.push(`handOver:${organizationId}:${formerOwnerUserId}`);
    return Promise.resolve(this.awaiting);
  }

  /**
   * Method handOverAwaiting
   *
   * @description
   * Records the hand-over of the spaces that await the owner.
   *
   * @param {string} organizationId - The organization.
   * @returns {Promise<void>} Resolves once recorded.
   */
  public handOverAwaiting(organizationId: string): Promise<void> {
    this.calls.push(`handOverAwaiting:${organizationId}`);
    return Promise.resolve();
  }

  /**
   * Method unassignRemovedMember
   *
   * @description
   * Records the unassignment and reports how many tasks it touched.
   *
   * @param {string} organizationId - The organization.
   * @param {string} userId - The account of the former member.
   * @returns {Promise<number>} The configured count.
   */
  public unassignRemovedMember(organizationId: string, userId: string): Promise<number> {
    this.calls.push(`unassign:${organizationId}:${userId}`);
    return Promise.resolve(this.unassigned);
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
      ports,
    );
  });

  it('applies a join to the copy only', async () => {
    const output = await useCase.execute(memberEvent('joined', 1));

    expect(ports.calls).toEqual(['apply:joined:1']);
    expect(output).toEqual({ privateSpacesAwaitingOwner: 0 });
  });

  it('applies a role change to the copy only, the member keeping the spaces they own', async () => {
    const output = await useCase.execute(memberEvent('role-changed', 2, 'admin'));

    expect(ports.calls).toEqual(['apply:role-changed:2']);
    expect(output).toEqual({ privateSpacesAwaitingOwner: 0 });
  });

  it('applies a removal to the copy first, then hands the private spaces of the member over', async () => {
    await useCase.execute(memberEvent('removed', 3));

    expect(ports.calls).toEqual([
      'apply:removed:3',
      `handOver:${ATELIER_NORD}:${HUGO}`,
      `unassign:${ATELIER_NORD}:${HUGO}`,
    ]);
  });

  it('hands nothing over and unassigns nothing when the copy refuses the removal, so the event is redelivered', async () => {
    ports.failure = new Error('The membership names another account.');

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toThrow(ports.failure);
    expect(ports.calls).toEqual([]);
  });
});

describe('ApplyMemberEvent: a removal always commits, and says how many private spaces await an owner', () => {
  let ports: RecordingPorts;
  let useCase: ApplyMemberEvent;

  beforeEach(() => {
    ports = new RecordingPorts();
    useCase = new ApplyMemberEvent(
      { run: <TResult>(work: () => Promise<TResult>): Promise<TResult> => work() },
      ports,
      ports,
      ports,
    );
  });

  it('returns the count the hand-over reports when the owner of the organization is unknown', async () => {
    ports.awaiting = 2;

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ privateSpacesAwaitingOwner: 2 });
  });

  it('keeps the count of the private spaces whatever number of tasks the unassignment touched', async () => {
    ports.awaiting = 1;
    ports.unassigned = 4_000;

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ privateSpacesAwaitingOwner: 1 });
  });

  it('returns 0 when every private space was handed over, or there was none', async () => {
    ports.awaiting = 0;

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ privateSpacesAwaitingOwner: 0 });
  });

  it('does not hand over the spaces that await an owner when the removed member was an owner', async () => {
    ports.awaiting = 1;

    const output = await useCase.execute(memberEvent('removed', 3, 'owner'));

    expect(ports.calls).toEqual([
      'apply:removed:3',
      `handOver:${ATELIER_NORD}:${HUGO}`,
      `unassign:${ATELIER_NORD}:${HUGO}`,
    ]);
    expect(output).toEqual({ privateSpacesAwaitingOwner: 1 });
  });
});

describe('ApplyMemberEvent: only a removal unassigns the member from the tasks', () => {
  it.each([
    ['joined', 'owner'],
    ['joined', 'guest'],
    ['role-changed', 'guest'],
    ['role-changed', 'owner'],
  ] as const)('does not unassign on a %s event with the role %s', async (kind, role) => {
    const ports: RecordingPorts = new RecordingPorts();
    const useCase: ApplyMemberEvent = new ApplyMemberEvent(
      { run: <TResult>(work: () => Promise<TResult>): Promise<TResult> => work() },
      ports,
      ports,
      ports,
    );

    await useCase.execute(memberEvent(kind, 2, role));

    expect(ports.calls.some((call: string): boolean => call.startsWith('unassign'))).toBe(false);
  });
});

describe('ApplyMemberEvent: an owner who arrives takes the private spaces that await one', () => {
  let ports: RecordingPorts;
  let useCase: ApplyMemberEvent;

  beforeEach(() => {
    ports = new RecordingPorts();
    ports.awaiting = 5;
    useCase = new ApplyMemberEvent(
      { run: <TResult>(work: () => Promise<TResult>): Promise<TResult> => work() },
      ports,
      ports,
      ports,
    );
  });

  it('hands the awaiting spaces over after the copy learns the owner who joined', async () => {
    const output = await useCase.execute(memberEvent('joined', 1, 'owner'));

    expect(ports.calls).toEqual(['apply:joined:1', `handOverAwaiting:${ATELIER_NORD}`]);
    expect(output).toEqual({ privateSpacesAwaitingOwner: 0 });
  });

  it('hands the awaiting spaces over when a member becomes the owner', async () => {
    const output = await useCase.execute(memberEvent('role-changed', 2, 'owner'));

    expect(ports.calls).toEqual(['apply:role-changed:2', `handOverAwaiting:${ATELIER_NORD}`]);
    expect(output).toEqual({ privateSpacesAwaitingOwner: 0 });
  });

  it.each(['admin', 'member', 'guest'] as const)(
    'hands nothing over when the member joins as %s',
    async (role) => {
      await useCase.execute(memberEvent('joined', 1, role));

      expect(ports.calls).toEqual(['apply:joined:1']);
    },
  );

  it.each(['admin', 'member', 'guest'] as const)(
    'hands nothing over when a role change leaves the member as %s',
    async (role) => {
      await useCase.execute(memberEvent('role-changed', 2, role));

      expect(ports.calls).toEqual(['apply:role-changed:2']);
    },
  );

  it('hands nothing over when the copy refuses the event', async () => {
    ports.failure = new Error('The membership names another account.');

    await expect(useCase.execute(memberEvent('joined', 1, 'owner'))).rejects.toThrow(ports.failure);
    expect(ports.calls).toEqual([]);
  });
});

/** What the use case did, in order, with a unit of work that records where it begins and ends. */
interface TracedPorts {
  // #region Properties
  /**
   * Property steps
   *
   * @description
   * The steps, in order: `begin`, the port calls, then `commit` or `rollback`.
   *
   * @type {string[]}
   * @readonly
   */
  readonly steps: string[];

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
 * Wires the use case on a unit of work and two ports that write to one list of steps.
 *
 * @param failures - The port calls that must throw, by name.
 * @param awaiting - How many spaces the hand-over reports as awaiting an owner.
 * @returns The steps and the use case.
 */
function traced(
  failures: Readonly<
    Partial<Record<'apply' | 'handOver' | 'handOverAwaiting' | 'unassign', Error>>
  > = {},
  awaiting: number = 0,
): TracedPorts {
  const steps: string[] = [];
  const unitOfWork: MemberEventUnitOfWork = {
    run: async <TResult>(work: () => Promise<TResult>): Promise<TResult> => {
      steps.push('begin');
      try {
        const result: TResult = await work();
        steps.push('commit');
        return result;
      } catch (error: unknown) {
        steps.push('rollback');
        throw error;
      }
    },
  };
  const ports: MembershipCopy & PrivateSpaceHandover & TaskAssignments = {
    apply: (change: ApplyMemberEventInput): Promise<void> => {
      steps.push(`apply:${change.kind}`);
      return failures.apply === undefined ? Promise.resolve() : Promise.reject(failures.apply);
    },
    handOver: (): Promise<number> => {
      steps.push('handOver');
      return failures.handOver === undefined
        ? Promise.resolve(awaiting)
        : Promise.reject(failures.handOver);
    },
    handOverAwaiting: (): Promise<void> => {
      steps.push('handOverAwaiting');
      return failures.handOverAwaiting === undefined
        ? Promise.resolve()
        : Promise.reject(failures.handOverAwaiting);
    },
    unassignRemovedMember: (): Promise<number> => {
      steps.push('unassign');
      return failures.unassign === undefined
        ? Promise.resolve(0)
        : Promise.reject(failures.unassign);
    },
  };
  return { steps, useCase: new ApplyMemberEvent(unitOfWork, ports, ports, ports) };
}

describe('ApplyMemberEvent: the copy and the hand-over of the private spaces are one unit of work', () => {
  it('runs a join inside the unit of work, which commits it', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1));

    expect(steps).toEqual(['begin', 'apply:joined', 'commit']);
  });

  it('runs the copy and the hand-over of a removal inside the same unit of work', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('removed', 3));

    expect(steps).toEqual(['begin', 'apply:removed', 'handOver', 'unassign', 'commit']);
  });

  it('rejects the run when the unassignment fails, and rolls the copy and the hand-over back', async () => {
    const failure = new Error('The unassignment failed.');
    const { steps, useCase } = traced({ unassign: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toBe(failure);

    expect(steps).toEqual(['begin', 'apply:removed', 'handOver', 'unassign', 'rollback']);
  });

  it('does not unassign when the hand-over fails', async () => {
    const { steps, useCase } = traced({ handOver: new Error('The hand-over failed.') });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toThrow();

    expect(steps).not.toContain('unassign');
  });

  it('runs the copy and the hand-over of the awaiting spaces of an owner inside one unit of work', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1, 'owner'));

    expect(steps).toEqual(['begin', 'apply:joined', 'handOverAwaiting', 'commit']);
  });

  it('returns the count of the removal once the unit of work has committed', async () => {
    const { steps, useCase } = traced({}, 3);

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ privateSpacesAwaitingOwner: 3 });
    expect(steps.at(-1)).toBe('commit');
  });

  it('rejects the run when the hand-over fails, and the unit of work rolls the copy back', async () => {
    const failure = new Error('The hand-over failed.');
    const { steps, useCase } = traced({ handOver: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toBe(failure);

    expect(steps).toEqual(['begin', 'apply:removed', 'handOver', 'rollback']);
  });

  it('rejects the run when the hand-over of the awaiting spaces fails, and rolls the copy back', async () => {
    const failure = new Error('The hand-over failed.');
    const { steps, useCase } = traced({ handOverAwaiting: failure });

    await expect(useCase.execute(memberEvent('role-changed', 2, 'owner'))).rejects.toBe(failure);

    expect(steps).toEqual(['begin', 'apply:role-changed', 'handOverAwaiting', 'rollback']);
  });

  it('rejects the run when the copy fails, without handing anything over', async () => {
    const failure = new Error('The membership names another account.');
    const { steps, useCase } = traced({ apply: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toBe(failure);

    expect(steps).toEqual(['begin', 'apply:removed', 'rollback']);
  });

  it('does not let a failing hand-over touch an event that hands nothing over', async () => {
    const { steps, useCase } = traced({
      handOver: new Error('never called'),
      handOverAwaiting: new Error('never called'),
      unassign: new Error('never called'),
    });

    await useCase.execute(memberEvent('role-changed', 2));

    expect(steps).toEqual(['begin', 'apply:role-changed', 'commit']);
  });

  it('opens one unit of work per event', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1));
    await useCase.execute(memberEvent('removed', 3));

    expect(steps.filter((step: string) => step === 'begin')).toHaveLength(2);
    expect(steps.filter((step: string) => step === 'commit')).toHaveLength(2);
  });
});
