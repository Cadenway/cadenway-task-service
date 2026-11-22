import { describe, expect, it } from 'vitest';

import type { SpaceHandoverBatch } from '../../../../models/clean-up/space-handover-batch.model.js';
import type { MemberEventStore } from '../../../../models/transactions/member-event-store.model.js';
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

/** The ports and steps a spec wires the use case on. */
type Step = 'apply' | 'handOverAwaiting' | 'enqueue';

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

/** What the use case did, in order, with a unit of work that records where it begins and ends. */
interface Traced {
  // #region Properties
  /** The steps, in order: `begin`, the port calls, then `commit` or `rollback`. */
  readonly steps: string[];

  /** The use case under test, wired on the traced ports. */
  readonly useCase: ApplyMemberEvent;
  // #endregion
}

/**
 * Wires the use case on a unit of work, a copy, a handover and a queue that write to one list of
 * steps.
 *
 * @param failures - The calls that must throw, by name.
 * @param enqueued - What the queue answers: `false` for an occurrence already enqueued.
 * @returns The steps and the use case.
 */
function traced(failures: Readonly<Partial<Record<Step, Error>>> = {}, enqueued = true): Traced {
  const steps: string[] = [];
  const answer = <TResult>(step: Step, value: TResult): Promise<TResult> => {
    const failure: Error | undefined = failures[step];
    return failure === undefined ? Promise.resolve(value) : Promise.reject(failure);
  };
  const store: MemberEventStore = {
    cleanUps: {
      enqueue: (userId: string, memberId: string, membershipVersion: number): Promise<boolean> => {
        steps.push(`enqueue:${userId}:${memberId}:${String(membershipVersion)}`);
        return answer('enqueue', enqueued);
      },
      enqueueOwnerHandover: () => Promise.resolve(),
    },
  };
  const unitOfWork: MemberEventUnitOfWork = {
    run: async <TResult>(work: (scope: MemberEventStore) => Promise<TResult>): Promise<TResult> => {
      steps.push('begin');
      try {
        const result: TResult = await work(store);
        steps.push('commit');
        return result;
      } catch (error: unknown) {
        steps.push('rollback');
        throw error;
      }
    },
  };
  const memberships: MembershipCopy = {
    apply: (change: ApplyMemberEventInput): Promise<void> => {
      steps.push(`apply:${change.kind}:${String(change.version)}`);
      return answer('apply', undefined);
    },
  };
  const spaces: PrivateSpaceHandover = {
    handOverBatch: (): Promise<SpaceHandoverBatch> => {
      steps.push('handOverBatch');
      return Promise.resolve({ outcome: 'none-left' });
    },
    handOverAwaiting: (organizationId: string): Promise<void> => {
      steps.push(`handOverAwaiting:${organizationId}`);
      return answer('handOverAwaiting', undefined);
    },
  };
  return { steps, useCase: new ApplyMemberEvent(unitOfWork, memberships, spaces) };
}

describe('ApplyMemberEvent: a removal commits the copy and the clean-up job, nothing else', () => {
  it('applies the removal to the copy first, then enqueues the clean-up of that membership at that version, in one transaction', async () => {
    const { steps, useCase } = traced();

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ cleanUpEnqueued: true });
    expect(steps).toEqual([
      'begin',
      'apply:removed:3',
      `enqueue:${HUGO}:${HUGO_MEMBERSHIP}:3`,
      'commit',
    ]);
  });

  it('hands no space over in the transaction of the removal, also when the former member was an owner', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('removed', 3, 'owner'));

    expect(steps.some((step) => step.startsWith('handOver'))).toBe(false);
  });

  it('commits the same way when an earlier delivery already enqueued the job', async () => {
    const { steps, useCase } = traced({}, false);

    const output = await useCase.execute(memberEvent('removed', 3));

    expect(output).toEqual({ cleanUpEnqueued: false });
    expect(steps.at(-1)).toBe('commit');
  });

  it('enqueues nothing and rolls back when the copy refuses the removal, so the event is redelivered', async () => {
    const failure = new Error('The membership names another account.');
    const { steps, useCase } = traced({ apply: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toThrow(failure);
    expect(steps).toEqual(['begin', 'apply:removed:3', 'rollback']);
  });

  it('rolls the copy back with the removal when the job cannot be enqueued', async () => {
    const failure = new Error('The job table is unavailable.');
    const { steps, useCase } = traced({ enqueue: failure });

    await expect(useCase.execute(memberEvent('removed', 3))).rejects.toThrow(failure);
    expect(steps.at(-1)).toBe('rollback');
  });
});

describe('ApplyMemberEvent: only a removal enqueues the clean-up of the member', () => {
  it.each([
    ['joined', 'owner'],
    ['joined', 'guest'],
    ['role-changed', 'guest'],
    ['role-changed', 'owner'],
  ] as const)('enqueues nothing on a %s event with the role %s', async (kind, role) => {
    const { steps, useCase } = traced();

    const output = await useCase.execute(memberEvent(kind, 2, role));

    expect(output).toEqual({ cleanUpEnqueued: false });
    expect(steps.some((step) => step.startsWith('enqueue'))).toBe(false);
  });
});

describe('ApplyMemberEvent: an owner who arrives takes the private spaces that await one, inline', () => {
  it('hands the awaiting spaces over after the copy learns the owner who joined', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('joined', 1, 'owner'));

    expect(steps).toEqual([
      'begin',
      'apply:joined:1',
      `handOverAwaiting:${ATELIER_NORD}`,
      'commit',
    ]);
  });

  it('hands the awaiting spaces over when a member becomes the owner', async () => {
    const { steps, useCase } = traced();

    await useCase.execute(memberEvent('role-changed', 2, 'owner'));

    expect(steps).toEqual([
      'begin',
      'apply:role-changed:2',
      `handOverAwaiting:${ATELIER_NORD}`,
      'commit',
    ]);
  });

  it.each(['admin', 'member', 'guest'] as const)(
    'hands nothing over when the member joins as %s',
    async (role) => {
      const { steps, useCase } = traced();

      await useCase.execute(memberEvent('joined', 1, role));

      expect(steps).toEqual(['begin', 'apply:joined:1', 'commit']);
    },
  );

  it('rolls the change of the copy back when the handover fails, so the event is redelivered', async () => {
    const failure = new Error('lock timeout');
    const { steps, useCase } = traced({ handOverAwaiting: failure });

    await expect(useCase.execute(memberEvent('joined', 1, 'owner'))).rejects.toThrow(failure);
    expect(steps).toEqual([
      'begin',
      'apply:joined:1',
      `handOverAwaiting:${ATELIER_NORD}`,
      'rollback',
    ]);
  });
});
