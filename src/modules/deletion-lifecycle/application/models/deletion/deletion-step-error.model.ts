import type { DeletionStep } from './deletion-step.model.js';

/**
 * Constant SQLSTATE
 *
 * @description
 * A SQLSTATE code of PostgreSQL: five digits or upper-case letters.
 *
 * @type {RegExp}
 */
const SQLSTATE: RegExp = /^[0-9A-Z]{5}$/u;

/**
 * Function isRecord
 *
 * @description
 * Whether a value can hold the fields of an error.
 *
 * @param {unknown} value - The value.
 * @returns {boolean} `true` for a non-null object.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

/**
 * Function isDatabaseError
 *
 * @description
 * Recognizes a database error by its shape, as `databaseErrorOf` of the logging of
 * `@cadenway/nest-common` does, without importing a driver into the application layer: a
 * `DatabaseError` of `pg`, a `DrizzleQueryError` (whose message holds the SQL text and its
 * parameters), an error carrying a query and its parameters, or one carrying a SQLSTATE and a
 * severity. A copy, with `describeFailure` below, of the same functions in
 * `src/modules/member-lifecycle/application/models/clean-up/clean-up-step-error.model.ts`, until
 * `@cadenway/nest-common` exports its private `databaseErrorOf` (a follow-up for
 * cadenway-service-kit): change both together.
 *
 * @param {Readonly<Record<string, unknown>>} error - The error, or its fields.
 * @returns {boolean} `true` for a database error.
 */
function isDatabaseError(error: Readonly<Record<string, unknown>>): boolean {
  const type: unknown = error instanceof Error ? error.constructor.name : error.type;
  return (
    type === 'DatabaseError' ||
    type === 'DrizzleQueryError' ||
    (typeof error.query === 'string' && Array.isArray(error.params)) ||
    (typeof error.code === 'string' &&
      SQLSTATE.test(error.code) &&
      typeof error.severity === 'string')
  );
}

/**
 * Function describeFailure
 *
 * @description
 * What the message of a failed step says of its cause, without SQL text or parameters. A cause
 * whose chain holds a database error is described by the primary message of PostgreSQL and its
 * SQLSTATE ("canceling statement due to lock timeout (SQLSTATE 55P03)"), never by the message of
 * a wrapper such as `DrizzleQueryError`, which holds the query and its parameters; the message of
 * a data exception (class 22, which can quote the value it refused) is left out, and a database
 * error without SQLSTATE says only that the database failed. Any other cause keeps its message.
 *
 * @param {unknown} cause - What the step rejected with.
 * @returns {string} The description.
 */
function describeFailure(cause: unknown): string {
  const visited: Set<unknown> = new Set<unknown>();
  let database: boolean = false;
  let sqlState: string | undefined;
  let primary: string | undefined;
  for (let link: unknown = cause; isRecord(link) && !visited.has(link); link = link.cause) {
    visited.add(link);
    if (!isDatabaseError(link)) {
      continue;
    }
    database = true;
    const code: unknown = link.code;
    if (sqlState === undefined && typeof code === 'string' && SQLSTATE.test(code)) {
      sqlState = code;
      primary =
        typeof link.message === 'string' && !code.startsWith('22') ? link.message : undefined;
    }
  }
  if (!database) {
    return cause instanceof Error ? cause.message : String(cause);
  }
  if (sqlState === undefined) {
    return 'database operation failed';
  }
  return `${primary ?? 'database error'} (SQLSTATE ${sqlState})`;
}

/**
 * Class DeletionStepError
 *
 * @description
 * A step of a deletion job that failed (the database, a lock or statement timeout, a defect), with
 * the step it belongs to and the batches the attempt committed before it, so that the one log line
 * of the kit for the failed attempt, the error stored with the job and its dead letter, and the
 * span of the job say where the job stopped and what it had done: "tasks batch failed after 3
 * committed batches: canceling statement due to lock timeout (SQLSTATE 55P03)". The message holds
 * no SQL text, no parameter and no id: a database error is described by its PostgreSQL message and
 * SQLSTATE only. The failed step rolled back alone; the original error is the `cause`, which only
 * the process sees.
 */
export class DeletionStepError extends Error {
  // #region Properties
  /**
   * Property step
   *
   * @description
   * The step that failed.
   *
   * @type {DeletionStep}
   * @readonly
   */
  public readonly step: DeletionStep;

  /**
   * Property batches
   *
   * @description
   * The batches the attempt committed before the failed step, of every step.
   *
   * @type {number}
   * @readonly
   */
  public readonly batches: number;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Wraps the failure of a step.
   *
   * @param {DeletionStep} step - The step that failed.
   * @param {number} batches - The batches committed before it.
   * @param {unknown} cause - What the step rejected with.
   * @constructor
   */
  public constructor(step: DeletionStep, batches: number, cause: unknown) {
    super(
      `${step} batch failed after ${String(batches)} committed batches: ${describeFailure(cause)}`,
      { cause },
    );
    this.name = 'DeletionStepError';
    this.step = step;
    this.batches = batches;
  }
  // #endregion
}
