import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';

import { CleanUpStepError } from './clean-up-step-error.model.js';

/** Account of Hugo Dubois (HD), a parameter of the failed statement. */
const HUGO: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b32';

/** The SQL text of the failed statement. */
const QUERY: string = 'delete from "list_grants" where "user_id" = $1';

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

describe('CleanUpStepError: says where the clean-up stopped, without SQL text or parameters', () => {
  it('names the step, the batches committed and the cause of an application error', () => {
    const cause = new Error('statement timeout');

    const error = new CleanUpStepError('grants', 2, cause);

    expect(error).toMatchObject({
      name: 'CleanUpStepError',
      step: 'grants',
      batches: 2,
      cause,
      message: 'grants batch failed after 2 committed batches: statement timeout',
    });
  });

  it('describes a failed Drizzle query by the message of PostgreSQL and its SQLSTATE only', () => {
    const cause = new DrizzleQueryError(
      QUERY,
      [HUGO],
      postgresError('canceling statement due to lock timeout', '55P03'),
    );

    const error = new CleanUpStepError('grants', 2, cause);

    expect(error.message).toBe(
      'grants batch failed after 2 committed batches: canceling statement due to lock timeout (SQLSTATE 55P03)',
    );
    expect(error.message).not.toContain('delete');
    expect(error.message).not.toContain(HUGO);
    expect(error.stack).not.toContain(HUGO);
    expect(error.cause).toBe(cause);
  });

  it('leaves out the message of a data exception, which can quote the value it refused', () => {
    const cause = new DrizzleQueryError(
      QUERY,
      ['hugo'],
      postgresError('invalid input syntax for type uuid: "hugo"', '22P02'),
    );

    expect(new CleanUpStepError('tasks', 0, cause).message).toBe(
      'tasks batch failed after 0 committed batches: database error (SQLSTATE 22P02)',
    );
  });

  it('says only that the database failed for a failed query without SQLSTATE', () => {
    const cause = new DrizzleQueryError(QUERY, [HUGO], new Error('Connection terminated'));

    expect(new CleanUpStepError('requests', 1, cause).message).toBe(
      'requests batch failed after 1 committed batches: database operation failed',
    );
  });
});
