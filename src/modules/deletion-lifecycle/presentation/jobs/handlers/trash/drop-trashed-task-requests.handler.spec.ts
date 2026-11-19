import { AsyncLocalStorage } from 'node:async_hooks';

import type { Job, JobHandler, JobWorkerRegistry } from '@cadenway/nest-jobs/runtime';
import { Logger } from '@nestjs/common';
import { context, propagation, ROOT_CONTEXT, SpanStatusCode, trace } from '@opentelemetry/api';
import type {
  Context,
  ContextManager,
  Span,
  TextMapGetter,
  TextMapPropagator,
  Tracer,
} from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { DropTrashedTaskRequestsInput } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.input.js';
import type { DropTrashedTaskRequestsOutput } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.output.js';
import type { DropTrashedTaskRequests } from '../../../../application/use-cases/commands/trash/drop-trashed-task-requests/drop-trashed-task-requests.use-case.js';
import { DropTrashedTaskRequestsHandler } from './drop-trashed-task-requests.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** CAD-482, the root of the entry. */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

/** CAD-483, a subtask of CAD-482 in the entry. */
const CAD_483: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1483';

/** A W3C `traceparent` of "Supprimer la tâche". */
const TRACEPARENT: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/**
 * Builds a job of the queue as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000021',
    queue: 'task.drop-trashed-task-requests',
    payload: { taskIds: [CAD_482, CAD_483] },
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
 * @returns The handler, the recorded inputs and the registered queue.
 */
function handlerOn(output: DropTrashedTaskRequestsOutput | Error): {
  readonly handler: DropTrashedTaskRequestsHandler;
  readonly inputs: DropTrashedTaskRequestsInput[];
  readonly registered: { queue: string; handler: JobHandler | null };
} {
  const inputs: DropTrashedTaskRequestsInput[] = [];
  const registered: { queue: string; handler: JobHandler | null } = { queue: '', handler: null };
  const useCase = {
    execute: (input: DropTrashedTaskRequestsInput): Promise<DropTrashedTaskRequestsOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as DropTrashedTaskRequests;
  const workers: JobWorkerRegistry = {
    work: <TPayload>(queue: string, handler: JobHandler<TPayload>): Promise<void> => {
      registered.queue = queue;
      registered.handler = handler as JobHandler;
      return Promise.resolve();
    },
  };
  return {
    handler: new DropTrashedTaskRequestsHandler(
      workers,
      useCase,
      'task.drop-trashed-task-requests',
    ),
    inputs,
    registered,
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

describe('DropTrashedTaskRequestsHandler: each job drops the requests of the tasks of one entry', () => {
  let log: MockInstance<Logger['log']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    propagation.disable();
  });

  it('registers its worker on the queue it was given', async () => {
    const { handler, registered } = handlerOn({ dropped: 0, untrashed: 0 });

    await handler.onApplicationBootstrap();

    expect(registered.queue).toBe('task.drop-trashed-task-requests');
    expect(registered.handler).not.toBeNull();
  });

  it('runs the use case for the organization and the tasks of the job, lower-cased', async () => {
    const { handler, inputs } = handlerOn({ dropped: 1, untrashed: 0 });

    await handler.handle(
      jobOf({
        organizationId: ATELIER_NORD.toUpperCase(),
        payload: { taskIds: [CAD_482.toUpperCase(), CAD_483] },
      }),
    );

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, taskIds: [CAD_482, CAD_483] }]);
  });

  it('logs the requests dropped with the job id and counts, without any id of a task', async () => {
    const { handler } = handlerOn({ dropped: 1, untrashed: 1 });

    await handler.handle(jobOf());

    expect(log).toHaveBeenCalledWith(
      {
        jobId: '019a8000-0000-8000-8000-000000000021',
        attempt: 1,
        tasks: 2,
        untrashed: 1,
        dropped: 1,
      },
      expect.any(String),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(CAD_482);
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
    const { handler } = handlerOn({ dropped: 0, untrashed: 0 });

    await handler.handle(jobOf());
    getTracer.mockRestore();
    context.disable();

    expect(spansAtLog).toEqual([started]);
  });

  it('continues the trace that "Supprimer la tâche" stored with the job', async () => {
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
    const { handler } = handlerOn({ dropped: 0, untrashed: 0 });

    await handler.handle(jobOf({ payload: { taskIds: [CAD_482], traceparent: TRACEPARENT } }));

    expect(extracted).toEqual([TRACEPARENT]);
  });

  it('takes an entry of more than 2,000 tasks whole, which the use case drops in chunks', async () => {
    const { handler, inputs } = handlerOn({ dropped: 0, untrashed: 0 });
    const taskIds = Array.from({ length: 2_001 }, () => CAD_482);

    await handler.handle(jobOf({ payload: { taskIds } }));

    expect(inputs[0]?.taskIds).toHaveLength(2_001);
  });

  it('rejects a job that is not one of this queue, so it ends as a dead letter, and runs nothing', async () => {
    const { handler, inputs } = handlerOn({ dropped: 0, untrashed: 0 });

    for (const job of [
      jobOf({ payload: {} }),
      jobOf({ payload: { taskIds: ['CAD-482'] } }),
      jobOf({ organizationId: null }),
    ]) {
      await expect(handler.handle(job)).rejects.toThrow();
    }
    expect(inputs).toEqual([]);
  });

  it('records the failure on the span with its step and rejects with it, so the queue retries the job', async () => {
    const failure = new DeletionStepError('requests', 0, new Error('lock timeout'));
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
      'deletion.step': 'requests',
      'deletion.batches': 0,
    });
    expect(setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: SpanStatusCode.ERROR }));
    expect(end).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });
});
