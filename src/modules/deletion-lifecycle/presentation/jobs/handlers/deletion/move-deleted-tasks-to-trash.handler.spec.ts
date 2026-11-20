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
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, MockInstance } from 'vitest';

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { MoveDeletedTasksToTrashInput } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.input.js';
import type { MoveDeletedTasksToTrashOutput } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.output.js';
import type { MoveDeletedTasksToTrash } from '../../../../application/use-cases/commands/deletion/move-deleted-tasks-to-trash/move-deleted-tasks-to-trash.use-case.js';
import { MoveDeletedTasksToTrashHandler } from './move-deleted-tasks-to-trash.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The list "Sprint 14", deleted. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/** The space "Produit", deleted. */
const PRODUIT: string = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';

/** A W3C `traceparent` of the deletion. */
const TRACEPARENT: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/** A run that moved everything. */
const COMPLETED: MoveDeletedTasksToTrashOutput = {
  outcome: 'completed',
  entries: 12,
  tasks: 40,
  requestsDropped: 3,
  listsPurged: 0,
  spacePurged: false,
  batches: 1,
};

/**
 * Builds a job of the queue as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000011',
    queue: 'task.trash-deleted-tasks',
    payload: { listId: SPRINT_14 },
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
function handlerOn(output: MoveDeletedTasksToTrashOutput | Error): {
  readonly handler: MoveDeletedTasksToTrashHandler;
  readonly inputs: MoveDeletedTasksToTrashInput[];
  readonly registered: { queue: string; handler: JobHandler | null };
} {
  const inputs: MoveDeletedTasksToTrashInput[] = [];
  const registered: { queue: string; handler: JobHandler | null } = { queue: '', handler: null };
  const useCase = {
    execute: (input: MoveDeletedTasksToTrashInput): Promise<MoveDeletedTasksToTrashOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as MoveDeletedTasksToTrash;
  const workers: JobWorkerRegistry = {
    work: <TPayload>(queue: string, handler: JobHandler<TPayload>): Promise<void> => {
      registered.queue = queue;
      registered.handler = handler as JobHandler;
      return Promise.resolve();
    },
  };
  return {
    handler: new MoveDeletedTasksToTrashHandler(workers, useCase, 'task.trash-deleted-tasks'),
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

describe('MoveDeletedTasksToTrashHandler: each job moves the tasks of one deleted list or space', () => {
  let log: MockInstance<Logger['log']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    propagation.disable();
  });

  it('registers its worker on the queue it was given', async () => {
    const { handler, registered } = handlerOn(COMPLETED);

    await handler.onApplicationBootstrap();

    expect(registered.queue).toBe('task.trash-deleted-tasks');
    expect(registered.handler).not.toBeNull();
  });

  it('runs the use case for the deleted list of the job, with the signal of the attempt', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);
    const job = jobOf();

    await handler.handle(job);

    expect(inputs).toEqual([
      {
        organizationId: ATELIER_NORD,
        target: { kind: 'list', listId: SPRINT_14 },
        signal: job.signal,
      },
    ]);
  });

  it('runs the use case for the deleted space of the job', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);

    await handler.handle(jobOf({ payload: { spaceId: PRODUIT, traceparent: TRACEPARENT } }));

    expect(inputs[0]?.target).toEqual({ kind: 'space', spaceId: PRODUIT });
  });

  it('lower-cases the ids of a job enqueued in upper case', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);

    await handler.handle(
      jobOf({
        organizationId: ATELIER_NORD.toUpperCase(),
        payload: { listId: SPRINT_14.toUpperCase() },
      }),
    );

    expect(inputs[0]).toMatchObject({
      organizationId: ATELIER_NORD,
      target: { kind: 'list', listId: SPRINT_14 },
    });
  });

  it('accepts the ids the kit accepts, whatever their version and variant bits', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);
    const listId = '01938f6e-0000-0000-0000-000000000014';

    await handler.handle(jobOf({ payload: { listId } }));

    expect(inputs[0]?.target).toEqual({ kind: 'list', listId });
  });

  it('logs the outcome with the job id, the kind of target and the counts, without any id', async () => {
    const { handler } = handlerOn(COMPLETED);

    await handler.handle(jobOf());

    expect(log).toHaveBeenCalledWith(
      {
        jobId: '019a8000-0000-8000-8000-000000000011',
        attempt: 1,
        target: 'list',
        outcome: 'completed',
        entries: 12,
        tasks: 40,
        requestsDropped: 3,
        listsPurged: 0,
        spacePurged: false,
        batches: 1,
      },
      expect.any(String),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(SPRINT_14);
    expect(JSON.stringify(log.mock.calls)).not.toContain(ATELIER_NORD);
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
    const { handler } = handlerOn(COMPLETED);

    await handler.handle(jobOf());
    getTracer.mockRestore();
    context.disable();

    expect(spansAtLog).toEqual([started]);
  });

  it('continues the trace the deletion stored with the job', async () => {
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

    await handler.handle(jobOf({ payload: { listId: SPRINT_14, traceparent: TRACEPARENT } }));
    await handler.handle(jobOf());

    expect(extracted).toEqual([TRACEPARENT]);
  });

  it('rejects a job that is not a deletion job, so it ends as a dead letter, and runs nothing', async () => {
    const { handler, inputs } = handlerOn(COMPLETED);

    for (const job of [
      jobOf({ payload: {} }),
      jobOf({ payload: { listId: SPRINT_14, spaceId: PRODUIT } }),
      jobOf({ payload: { listId: 'sprint-14' } }),
      jobOf({ payload: { spaceId: 42 } }),
      jobOf({ organizationId: null }),
    ]) {
      await expect(handler.handle(job)).rejects.toThrow();
    }
    expect(inputs).toEqual([]);
  });

  it('rejects with the error of the use case, so the queue retries the job, and logs nothing itself', async () => {
    const failure = new DeletionStepError('tasks', 2, new Error('lock timeout'));
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    expect(log).not.toHaveBeenCalled();
  });

  it('records the exception, the failed step and the batches committed on the span of the job', async () => {
    const failure = new DeletionStepError('tasks', 2, new Error('lock timeout'));
    const span = spanDouble();
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => span.span } as unknown as Tracer);
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    getTracer.mockRestore();

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'deletion.step': 'tasks',
      'deletion.batches': 2,
    });
    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: SpanStatusCode.ERROR }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
  });

  it('records on the span a failed query without its SQL text or its parameters', async () => {
    const postgres = new DatabaseError('canceling statement due to lock timeout', 40, 'error');
    postgres.code = '55P03';
    postgres.severity = 'ERROR';
    const failure = new DeletionStepError(
      'tasks',
      2,
      new DrizzleQueryError('select "id" from "tasks" where "list_id" = $1', [SPRINT_14], postgres),
    );
    const span = spanDouble();
    const getTracer = vi
      .spyOn(trace, 'getTracer')
      .mockReturnValue({ startSpan: () => span.span } as unknown as Tracer);
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    getTracer.mockRestore();

    const recorded: unknown = span.recordException.mock.calls[0]?.[0];
    expect(recorded).toBe(failure);
    expect((recorded as Error).message).toBe(
      'tasks batch failed after 2 committed batches: canceling statement due to lock timeout (SQLSTATE 55P03)',
    );
    expect(
      JSON.stringify({ message: (recorded as Error).message, stack: (recorded as Error).stack }),
    ).not.toContain(SPRINT_14);
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
    expect(span.end).toHaveBeenCalledTimes(1);
  });
});
