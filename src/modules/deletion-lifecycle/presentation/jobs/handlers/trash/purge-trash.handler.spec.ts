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
import type { Mock, MockInstance } from 'vitest';

import { DeletionStepError } from '../../../../application/models/deletion/deletion-step-error.model.js';
import type { PurgeTrashInput } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.input.js';
import type { PurgeTrashOutput } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.output.js';
import type { PurgeTrash } from '../../../../application/use-cases/commands/trash/purge-trash/purge-trash.use-case.js';
import { PurgeTrashHandler } from './purge-trash.handler.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** A W3C `traceparent` of "Vider la corbeille". */
const TRACEPARENT: string = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

/** A purge that erased two batches. */
const PURGED: PurgeTrashOutput = {
  entries: 23,
  tasks: 529,
  listsPurged: 2,
  spacesPurged: 1,
  batches: 2,
};

/**
 * Builds a job of the queue as the runtime hands it to the handler.
 *
 * @param overrides - Fields to replace.
 * @returns The job.
 */
function jobOf(overrides: Partial<Job> = {}): Job {
  return {
    id: '019a8000-0000-8000-8000-000000000031',
    queue: 'task.purge-trash',
    payload: {},
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
function handlerOn(output: PurgeTrashOutput | Error): {
  readonly handler: PurgeTrashHandler;
  readonly inputs: PurgeTrashInput[];
  readonly registered: { queue: string; handler: JobHandler | null };
} {
  const inputs: PurgeTrashInput[] = [];
  const registered: { queue: string; handler: JobHandler | null } = { queue: '', handler: null };
  const useCase = {
    execute: (input: PurgeTrashInput): Promise<PurgeTrashOutput> => {
      inputs.push(input);
      return output instanceof Error ? Promise.reject(output) : Promise.resolve(output);
    },
  } as unknown as PurgeTrash;
  const workers: JobWorkerRegistry = {
    work: <TPayload>(queue: string, handler: JobHandler<TPayload>): Promise<void> => {
      registered.queue = queue;
      registered.handler = handler as JobHandler;
      return Promise.resolve();
    },
  };
  return {
    handler: new PurgeTrashHandler(workers, useCase, 'task.purge-trash'),
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

/**
 * Builds a span that records its calls, and makes the tracer start it.
 *
 * @returns The recorded methods and the restore of the tracer.
 */
function recordedSpan(): {
  readonly recordException: Mock;
  readonly setAttributes: Mock;
  readonly setStatus: Mock;
  readonly end: Mock;
  readonly restore: () => void;
} {
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
  return {
    recordException,
    setAttributes,
    setStatus,
    end,
    restore: () => {
      getTracer.mockRestore();
    },
  };
}

describe('PurgeTrashHandler: each job erases the trash of one organization', () => {
  let log: MockInstance<Logger['log']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    propagation.disable();
  });

  it('registers its worker on the queue it was given', async () => {
    const { handler, registered } = handlerOn(PURGED);

    await handler.onApplicationBootstrap();

    expect(registered.queue).toBe('task.purge-trash');
    expect(registered.handler).not.toBeNull();
  });

  it('runs the use case for the organization of the job, lower-cased, with the signal of the attempt', async () => {
    const { handler, inputs } = handlerOn(PURGED);
    const job = jobOf({ organizationId: ATELIER_NORD.toUpperCase() });

    await handler.handle(job);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, signal: job.signal }]);
  });

  it('logs what it erased with the job id and the counts, without the organization', async () => {
    const { handler } = handlerOn(PURGED);

    await handler.handle(jobOf());

    expect(log).toHaveBeenCalledWith(
      {
        jobId: '019a8000-0000-8000-8000-000000000031',
        attempt: 1,
        entries: 23,
        tasks: 529,
        listsPurged: 2,
        spacesPurged: 1,
        batches: 2,
      },
      expect.any(String),
    );
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
    const { handler } = handlerOn(PURGED);

    await handler.handle(jobOf());
    getTracer.mockRestore();
    context.disable();

    expect(spansAtLog).toEqual([started]);
  });

  it('continues the trace of what enqueued the job, when it stored one', async () => {
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
    const { handler } = handlerOn(PURGED);

    await handler.handle(jobOf({ payload: { traceparent: TRACEPARENT } }));
    await handler.handle(jobOf());

    expect(extracted).toEqual([TRACEPARENT]);
  });

  it('rejects a job that is not a purge job, so it ends as a dead letter, and runs nothing', async () => {
    const { handler, inputs } = handlerOn(PURGED);

    for (const job of [
      jobOf({ organizationId: null }),
      jobOf({ organizationId: 'atelier-nord' }),
      jobOf({ payload: null }),
      jobOf({ payload: { traceparent: 42 } }),
    ]) {
      await expect(handler.handle(job)).rejects.toThrow();
    }
    expect(inputs).toEqual([]);
  });

  it('records the exception, the step purge and the batches committed on the span, and rejects', async () => {
    const failure = new DeletionStepError('purge', 1, new Error('lock timeout'));
    const span = recordedSpan();
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    span.restore();

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setAttributes).toHaveBeenCalledWith({
      'deletion.step': 'purge',
      'deletion.batches': 1,
    });
    expect(span.setStatus).toHaveBeenCalledWith(
      expect.objectContaining({ code: SpanStatusCode.ERROR }),
    );
    expect(span.end).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it('records an abort without the step attributes', async () => {
    const failure = new Error('The attempt expired.');
    const span = recordedSpan();
    const { handler } = handlerOn(failure);

    await expect(handler.handle(jobOf())).rejects.toBe(failure);
    span.restore();

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setAttributes).not.toHaveBeenCalled();
  });
});
