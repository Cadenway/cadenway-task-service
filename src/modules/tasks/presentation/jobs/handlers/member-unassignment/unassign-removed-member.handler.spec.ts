import type { Job, JobHandler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UnassignRemovedMemberInput } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.input.js';
import type { UnassignRemovedMemberOutput } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.output.js';
import type { UnassignRemovedMember } from '../../../../application/use-cases/commands/assignee/unassign-removed-member/unassign-removed-member.use-case.js';
import { UnassignRemovedMemberHandler } from './unassign-removed-member.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/**
 * Builds a job of the queue as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000001',
    queue: 'task.unassign-removed-member',
    payload: { userId: HUGO },
    organizationId: ATELIER_NORD,
    attempt: 1,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/**
 * Builds the handler on a use case that records its input and answers `output`.
 *
 * @param output - What the use case answers, or the error it rejects with.
 * @returns The handler, the recorded inputs and the registered handler of the queue.
 */
function handlerOn(output: UnassignRemovedMemberOutput | Error): {
  readonly handler: UnassignRemovedMemberHandler;
  readonly inputs: UnassignRemovedMemberInput[];
  readonly registered: { queue: string; handler: JobHandler | null };
} {
  const inputs: UnassignRemovedMemberInput[] = [];
  const registered: { queue: string; handler: JobHandler | null } = { queue: '', handler: null };
  const useCase = {
    execute: (input: UnassignRemovedMemberInput): Promise<UnassignRemovedMemberOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as UnassignRemovedMember;
  const workers: JobWorkerRegistry = {
    work: <TPayload>(queue: string, handler: JobHandler<TPayload>): Promise<void> => {
      registered.queue = queue;
      registered.handler = handler as JobHandler;
      return Promise.resolve();
    },
  };
  return {
    handler: new UnassignRemovedMemberHandler(workers, useCase, 'task.unassign-removed-member'),
    inputs,
    registered,
  };
}

describe('UnassignRemovedMemberHandler: each job unassigns its former member in its organization', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the worker of its queue at bootstrap and runs the use case for the job', async () => {
    const { handler, inputs, registered } = handlerOn({
      outcome: 'completed',
      unassigned: 1200,
      batches: 3,
    });

    await handler.onApplicationBootstrap();
    const job = jobOf();
    await registered.handler?.(job);

    expect(registered.queue).toBe('task.unassign-removed-member');
    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, userId: HUGO, signal: job.signal }]);
  });

  it('passes the ids in lower case', async () => {
    const { handler, inputs } = handlerOn({ outcome: 'member-again', unassigned: 0, batches: 0 });

    await handler.handle(
      jobOf({
        organizationId: ATELIER_NORD.toUpperCase(),
        payload: { userId: HUGO.toUpperCase() },
      }),
    );

    expect(inputs[0]).toMatchObject({ organizationId: ATELIER_NORD, userId: HUGO });
  });

  it.each([
    ['a job without organization', { organizationId: null }],
    ['a payload without account', { payload: {} }],
    ['an account that is not a UUID', { payload: { userId: 'hugo' } }],
  ] as const)('refuses %s without running the use case', async (_, overrides) => {
    const { handler, inputs } = handlerOn({ outcome: 'completed', unassigned: 0, batches: 0 });

    await expect(handler.handle(jobOf(overrides))).rejects.toThrow();

    expect(inputs).toEqual([]);
  });

  it('rejects with the failure of a batch, so the queue retries the job', async () => {
    const failure = new Error('canceling statement due to lock timeout');
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf({ attempt: 2 }))).rejects.toBe(failure);
  });
});
