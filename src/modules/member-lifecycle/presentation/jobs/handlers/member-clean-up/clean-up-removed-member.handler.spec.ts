import type { Job, JobHandler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import { propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Span, TextMapGetter, TextMapPropagator, Tracer } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { CleanUpStepError } from '../../../../application/models/clean-up/clean-up-step-error.model.js';
import type { CleanUpRemovedMemberInput } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.input.js';
import type { CleanUpRemovedMemberOutput } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.output.js';
import type { CleanUpRemovedMember } from '../../../../application/use-cases/commands/membership/clean-up-removed-member/clean-up-removed-member.use-case.js';
import { CleanUpRemovedMemberHandler } from './clean-up-removed-member.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** Account of Hugo Dubois (HD), who left Atelier Nord. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** The membership that ended. */
const HUGO_MEMBERSHIP: string = '019a9000-0000-7000-8000-000000000001';

/** A W3C `traceparent` of the delivery of the removal. */
const TRACEPARENT: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/** A clean-up that found everything done. */
const COMPLETED: CleanUpRemovedMemberOutput = {
  outcome: 'completed',
  spacesHandedOver: 2,
  spacesAwaitingOwner: 0,
  grantsRemoved: 5,
  requestsDropped: 3,
  tasksUnassigned: 700,
  watcherOverridesRemoved: 3,
  batches: 6,
};

/**
 * Builds a job of the queue as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000001',
    queue: 'task.clean-up-removed-member',
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
function handlerOn(output: CleanUpRemovedMemberOutput | Error): {
  readonly handler: CleanUpRemovedMemberHandler;
  readonly inputs: CleanUpRemovedMemberInput[];
  readonly recovered: string[];
  readonly registered: { queue: string; handler: JobHandler | null };
} {
  const inputs: CleanUpRemovedMemberInput[] = [];
  const recovered: string[] = [];
  const registered: { queue: string; handler: JobHandler | null } = { queue: '', handler: null };
  const useCase = {
    execute: (input: CleanUpRemovedMemberInput): Promise<CleanUpRemovedMemberOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as CleanUpRemovedMember;
  const workers: JobWorkerRegistry = {
    work: <TPayload>(queue: string, handler: JobHandler<TPayload>): Promise<void> => {
      registered.queue = queue;
      registered.handler = handler as JobHandler;
      return Promise.resolve();
    },
  };
  return {
    handler: new CleanUpRemovedMemberHandler(
      workers,
      useCase,
      'task.clean-up-removed-member',
      (organizationId) => {
        recovered.push(organizationId);
        return Promise.resolve();
      },
    ),
    inputs,
    recovered,
    registered,
  };
}

describe('CleanUpRemovedMemberHandler: each job cleans up after one former member', () => {
  let log: MockInstance<Logger['log']>;
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
    propagation.disable();
  });

  it('registers its worker on the queue it was given', async () => {
    const { handler, registered } = handlerOn(COMPLETED);

    await handler.onApplicationBootstrap();

    expect(registered.queue).toBe('task.clean-up-removed-member');
    expect(registered.handler).not.toBeNull();
  });

  it('assigns spaces awaiting a restored owner without cleaning up an account', async () => {
    const { handler, inputs, recovered } = handlerOn(COMPLETED);
    await handler.handle(jobOf({ payload: { kind: 'owner-handover' } }));
    expect(recovered).toEqual([ATELIER_NORD]);
    expect(inputs).toEqual([]);
  });

  it('runs the use case for the organization and the account of the job, with the signal of the attempt', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);
    const job = jobOf();

    await handler.handle(job);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, userId: HUGO, signal: job.signal }]);
  });

  it('lower-cases the organization, account and membership IDs of the job', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);

    await handler.handle(
      jobOf({
        organizationId: ATELIER_NORD.toUpperCase(),
        payload: { userId: HUGO.toUpperCase(), memberId: HUGO_MEMBERSHIP.toUpperCase() },
      }),
    );

    expect(inputs[0]).toMatchObject({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
    });
  });

  it('accepts the ids the kit accepts, whatever their version and variant bits', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);
    const organizationId = '01938f6e-0000-0000-0000-000000000002';

    await handler.handle(jobOf({ organizationId }));

    expect(inputs[0]?.organizationId).toBe(organizationId);
  });

  it('logs the outcome with the job id and the counts, without the account', async () => {
    const { handler } = handlerOn(COMPLETED);

    await handler.handle(jobOf());

    expect(log).toHaveBeenCalledWith(
      {
        jobId: '019a8000-0000-8000-8000-000000000001',
        attempt: 1,
        outcome: 'completed',
        spacesHandedOver: 2,
        spacesAwaitingOwner: 0,
        grantsRemoved: 5,
        requestsDropped: 3,
        tasksUnassigned: 700,
        watcherOverridesRemoved: 3,
        batches: 6,
      },
      expect.any(String),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(HUGO);
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns once, without the account, when it left private spaces awaiting an owner', async () => {
    const { handler } = handlerOn({ ...COMPLETED, spacesAwaitingOwner: 3 });

    await handler.handle(jobOf());

    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(HUGO);
  });

  it('continues the trace the removal stored with the job', async () => {
    const extracted: (string | undefined)[] = [];
    const recording: TextMapPropagator = {
      inject: () => undefined,
      extract: (context, carrier, getter: TextMapGetter) => {
        const value = getter.get(carrier, 'traceparent');
        extracted.push(Array.isArray(value) ? value[0] : value);
        return context;
      },
      fields: () => ['traceparent'],
    };
    propagation.setGlobalPropagator(recording);
    const { handler } = handlerOn(COMPLETED);

    await handler.handle(jobOf({ payload: { userId: HUGO, traceparent: TRACEPARENT } }));
    await handler.handle(jobOf());

    expect(extracted).toEqual([TRACEPARENT]);
  });

  it('rejects a job that is not a clean-up job, so it ends as a dead letter, and runs nothing', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);

    for (const job of [
      jobOf({ payload: { user: HUGO } }),
      jobOf({ payload: { userId: 'hugo-dubois' } }),
      jobOf({ organizationId: null }),
    ]) {
      await expect(handler.handle(job)).rejects.toThrow();
    }
    expect(inputs).toEqual([]);
  });

  it('rejects with the error of the use case, so the queue retries the job, and logs nothing itself', async () => {
    const failure = new CleanUpStepError(
      'grants',
      2,
      new Error('canceling statement due to lock timeout'),
    );
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('records the exception, the failed step and the batches committed on the span of the job', async () => {
    const failure = new CleanUpStepError('grants', 2, new Error('lock timeout'));
    const span = spanDouble();
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => span.span } as unknown as Tracer);
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    getTracer.mockRestore();

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'cleanup.step': 'grants',
      'cleanup.batches': 2,
    });
    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: SpanStatusCode.ERROR }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records an error without a step, as an abort, without the step attributes', async () => {
    const failure = new Error('The attempt expired.');
    const span = spanDouble();
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => span.span } as unknown as Tracer);
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    getTracer.mockRestore();

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setAttributes).not.toHaveBeenCalled();
  });
});

/** A span that records what the handler does with it. */
interface SpanDouble {
  // #region Properties
  /** The span to hand to the handler. */
  readonly span: Span;

  /** `recordException`. */
  readonly recordException: Mock;

  /** `setAttributes`. */
  readonly setAttributes: Mock;

  /** `setStatus`. */
  readonly setStatus: Mock;

  /** `end`. */
  readonly end: Mock;
  // #endregion
}

/**
 * Builds a span that records its calls.
 *
 * @returns The span and its recorded methods.
 */
function spanDouble(): SpanDouble {
  const recordException = vi.fn();
  const setAttributes = vi.fn();
  const setStatus = vi.fn();
  const end = vi.fn();
  const span = {
    recordException,
    setAttributes,
    setStatus,
    end,
    spanContext: () => ({ traceId: '0'.repeat(32), spanId: '0'.repeat(16), traceFlags: 0 }),
    isRecording: () => true,
  } as unknown as Span;
  return { span, recordException, setAttributes, setStatus, end };
}
