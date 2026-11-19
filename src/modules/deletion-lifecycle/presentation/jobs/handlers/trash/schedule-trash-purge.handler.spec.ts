import { AsyncLocalStorage } from 'node:async_hooks';

import type {
  Job,
  JobScheduleOptions,
  JobScheduler,
  JobWorkerRegistry,
} from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import { context, ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import type { Context, ContextManager, Span, Tracer } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { ScheduleTrashPurgeInput } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.input.js';
import type { ScheduleTrashPurgeOutput } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.output.js';
import type { ScheduleTrashPurge } from '../../../../application/use-cases/commands/trash/schedule-trash-purge/schedule-trash-purge.use-case.js';
import { ScheduleTrashPurgeHandler } from './schedule-trash-purge.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** What an occurrence enqueued. */
const SCHEDULED: ScheduleTrashPurgeOutput = { organizations: 3, enqueued: 3, pages: 1 };

/**
 * Builds an occurrence of the schedule as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000041',
    queue: 'task.schedule-trash-purge',
    payload: null,
    organizationId: null,
    attempt: 1,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** What the scheduler and the workers were asked, in order. */
interface Registrations {
  // #region Properties
  /** The registrations, in order. */
  readonly calls: string[];

  /** The schedules registered. */
  readonly schedules: { queue: string; cron: string; options: JobScheduleOptions }[];
  // #endregion
}

/**
 * Builds the handler on a use case that records its input and answers `output`.
 *
 * @param output - What the use case answers, or the error it rejects with.
 * @returns The handler, the recorded inputs and the registrations.
 */
function handlerOn(output: ScheduleTrashPurgeOutput | Error): {
  readonly handler: ScheduleTrashPurgeHandler;
  readonly inputs: ScheduleTrashPurgeInput[];
  readonly registrations: Registrations;
} {
  const inputs: ScheduleTrashPurgeInput[] = [];
  const registrations: Registrations = { calls: [], schedules: [] };
  const useCase = {
    execute: (input: ScheduleTrashPurgeInput): Promise<ScheduleTrashPurgeOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as ScheduleTrashPurge;
  const workers: JobWorkerRegistry = {
    work: (queue: string): Promise<void> => {
      registrations.calls.push(`work:${queue}`);
      return Promise.resolve();
    },
  };
  const scheduler: JobScheduler = {
    schedule: (queue: string, cron: string, options: JobScheduleOptions): Promise<void> => {
      registrations.calls.push(`schedule:${queue}`);
      registrations.schedules.push({ queue, cron, options });
      return Promise.resolve();
    },
    unschedule: (): Promise<void> => Promise.reject(new Error('Not part of the schedule.')),
  };
  return {
    handler: new ScheduleTrashPurgeHandler(
      workers,
      scheduler,
      useCase,
      'task.schedule-trash-purge',
    ),
    inputs,
    registrations,
  };
}

/**
 * Registers a context manager on `AsyncLocalStorage`, as the SDK of the process does, so that a
 * spec can read the context a call runs in; `context.disable()` removes it.
 */
function enableContextManager(): void {
  const storage = new AsyncLocalStorage<Context>();
  const manager: ContextManager = {
    active: (): Context => storage.getStore() ?? ROOT_CONTEXT,
    with: <A extends unknown[], F extends (...args: A) => ReturnType<F>>(
      active: Context,
      fn: F,
      thisArg?: ThisParameterType<F>,
      ...args: A
    ): ReturnType<F> => storage.run(active, (): ReturnType<F> => fn.call(thisArg, ...args)),
    bind: <T>(_active: Context, target: T): T => target,
    enable: (): ContextManager => manager,
    disable: (): ContextManager => manager,
  };
  context.setGlobalContextManager(manager);
}

describe('ScheduleTrashPurgeHandler: the daily schedule of the purge and its worker', () => {
  let log: MockInstance<Logger['log']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('registers the schedule every day at 03:00 UTC under the key daily, then its worker', async () => {
    const { handler, registrations } = handlerOn(SCHEDULED);

    await handler.onApplicationBootstrap();

    expect(registrations.schedules).toEqual([
      {
        queue: 'task.schedule-trash-purge',
        cron: '0 3 * * *',
        options: { timeZone: 'UTC', key: 'daily' },
      },
    ]);
    expect(registrations.calls).toEqual([
      'schedule:task.schedule-trash-purge',
      'work:task.schedule-trash-purge',
    ]);
  });

  it('runs the use case with the id of the scheduled job and the signal of the attempt', async () => {
    const { handler, inputs } = handlerOn(SCHEDULED);
    const job = jobOf();

    await handler.handle(job);

    expect(inputs).toEqual([{ jobId: job.id, signal: job.signal }]);
  });

  it('logs what an occurrence enqueued with the job id and the counts', async () => {
    const { handler } = handlerOn(SCHEDULED);

    await handler.handle(jobOf());

    expect(log).toHaveBeenCalledWith(
      {
        jobId: '019a8000-0000-8000-8000-000000000041',
        attempt: 1,
        organizations: 3,
        enqueued: 3,
        pages: 1,
      },
      expect.any(String),
    );
  });

  it('logs the outcome inside the context of the span of the job, so the line carries its trace', async () => {
    enableContextManager();
    const started = {
      recordException: vi.fn(),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      spanContext: () => ({ traceId: '1'.repeat(32), spanId: '2'.repeat(16), traceFlags: 1 }),
      isRecording: () => true,
    } as unknown as Span;
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => started } as unknown as Tracer);
    const spansAtLog: (Span | undefined)[] = [];
    log.mockImplementation(() => {
      spansAtLog.push(trace.getSpan(context.active()));
    });
    const { handler } = handlerOn(SCHEDULED);

    await handler.handle(jobOf());
    getTracer.mockRestore();
    context.disable();

    expect(spansAtLog).toEqual([started]);
  });

  it('rejects a job that carries an organization, which no occurrence of the schedule does', async () => {
    const { handler, inputs } = handlerOn(SCHEDULED);

    await expect(handler.handle(jobOf({ organizationId: ATELIER_NORD }))).rejects.toThrow();
    expect(inputs).toEqual([]);
  });

  it('records the failure on the span with its step and rejects with it, so the queue retries the occurrence', async () => {
    const failure = new DeletionStepError('schedule', 1, new Error('statement timeout'));
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
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => span } as unknown as Tracer);
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    getTracer.mockRestore();

    expect(recordException).toHaveBeenCalledWith(failure);
    expect(setAttributes).toHaveBeenCalledWith({
      'deletion.step': 'schedule',
      'deletion.batches': 1,
    });
    expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: SpanStatusCode.ERROR }));
    expect(end).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});
