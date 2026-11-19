import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';

import { DeletionStepError } from './deletion-step-error.model.js';

/** The list "Sprint 14", a parameter of the failed statement. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/** The SQL text of the failed statement. */
const QUERY: string = 'select "id" from "tasks" where "list_id" = $1 for no key update';

/**
 * Builds the error `pg` rejects a statement with.
 *
 * @param message - The primary message of PostgreSQL.
 * @param code - The SQLSTATE.
 * @returns The error.
 */
function postgresError(message: string, code: string): DatabaseError {
  const error = new DatabaseError(message, message.length, 'error');
  error.code = code;
  error.severity = 'ERROR';
  return error;
}

describe('DeletionStepError: says where a job stopped, without SQL text or parameters', () => {
  it('names the step, the batches committed and the cause of an application error', () => {
    const cause = new Error('The trash entry was changed while it was locked.');

    const error = new DeletionStepError('tasks', 3, cause);

    expect(error).toMatchObject({
      name: 'DeletionStepError',
      step: 'tasks',
      batches: 3,
      cause,
      message:
        'tasks batch failed after 3 committed batches: The trash entry was changed while it was locked.',
    });
  });

  it('describes a failed Drizzle query by the message of PostgreSQL and its SQLSTATE only', () => {
    const cause = new DrizzleQueryError(
      QUERY,
      [SPRINT_14],
      postgresError('canceling statement due to lock timeout', '55P03'),
    );

    const error = new DeletionStepError('tasks', 2, cause);

    expect(error.message).toBe(
      'tasks batch failed after 2 committed batches: canceling statement due to lock timeout (SQLSTATE 55P03)',
    );
    expect(error.message).not.toContain('select');
    expect(error.message).not.toContain(SPRINT_14);
    expect(error.stack).not.toContain(SPRINT_14);
    expect(error.cause).toBe(cause);
  });

  it('describes an error of pg on its own the same way', () => {
    const error = new DeletionStepError(
      'purge',
      0,
      postgresError('canceling statement due to statement timeout', '57014'),
    );

    expect(error.message).toBe(
      'purge batch failed after 0 committed batches: canceling statement due to statement timeout (SQLSTATE 57014)',
    );
  });

  it('leaves out the message of a data exception, which can quote the value it refused', () => {
    const cause = new DrizzleQueryError(
      QUERY,
      ['sprint-14'],
      postgresError('invalid input syntax for type uuid: "sprint-14"', '22P02'),
    );

    const error = new DeletionStepError('lists', 0, cause);

    expect(error.message).toBe(
      'lists batch failed after 0 committed batches: database error (SQLSTATE 22P02)',
    );
  });

  it('says only that the database failed for a failed query without SQLSTATE', () => {
    const error = new DeletionStepError(
      'space',
      1,
      new DrizzleQueryError(QUERY, [SPRINT_14], new Error('Connection terminated unexpectedly')),
    );

    expect(error.message).toBe(
      'space batch failed after 1 committed batches: database operation failed',
    );
  });

  it('finds the database error further down the chain of causes', () => {
    const inner = new DrizzleQueryError(
      QUERY,
      [SPRINT_14],
      postgresError('deadlock detected', '40P01'),
    );
    const wrapped = new Error(`batch failed: ${inner.message}`, { cause: inner });

    const error = new DeletionStepError('requests', 0, wrapped);

    expect(error.message).toBe(
      'requests batch failed after 0 committed batches: deadlock detected (SQLSTATE 40P01)',
    );
  });

  it('keeps the text of a cause that is not an error, and ends on a cycle of causes', () => {
    const looping: Record<string, unknown> = { message: 'loop' };
    looping.cause = looping;

    expect(new DeletionStepError('schedule', 1, 'aborted').message).toBe(
      'schedule batch failed after 1 committed batches: aborted',
    );
    expect(new DeletionStepError('schedule', 1, looping).message).toBe(
      'schedule batch failed after 1 committed batches: [object Object]',
    );
  });
});
