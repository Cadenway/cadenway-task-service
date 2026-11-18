import type { z } from 'zod';

/**
 * Constant CALENDAR_DATE
 *
 * @description
 * A calendar date as the contract writes it, `YYYY-MM-DD`, with its year captured.
 *
 * @type {RegExp}
 */
const CALENDAR_DATE: RegExp = /^(\d{4})-\d{2}-\d{2}$/u;

/**
 * Constant DATE_MEMBERS
 *
 * @description
 * The members of a body that hold a calendar date, `dueDate` and `startDate`: only these are
 * checked for the year 0000, so a name, a label or a note that merely reads like a date
 * (`0000-11-03`) is a text like any other.
 *
 * @type {ReadonlySet<string>}
 */
const DATE_MEMBERS: ReadonlySet<string> = new Set<string>(['dueDate', 'startDate']);

/**
 * Function refuseUnstorableValues
 *
 * @description
 * Refuses, with one `request.invalid` issue each, the values the generated validators of the
 * contract accept but PostgreSQL cannot store, so that they answer `400` instead of failing the
 * write: a text holding the character U+0000 (refused by `text` and `jsonb`), checked on every
 * string, and a calendar date of the year 0000 (PostgreSQL has no year 0), checked on the date
 * members only (`DATE_MEMBERS`). Walks the whole body; the messages name the expectation, never
 * the value.
 *
 * @param {z.RefinementCtx} context - The refinement context of the body schema.
 * @param {unknown} value - The parsed body, or a member of it.
 * @param {readonly (string | number)[]} [path] - Where `value` sits in the body.
 */
export function refuseUnstorableValues(
  context: z.RefinementCtx,
  value: unknown,
  path: readonly (string | number)[] = [],
): void {
  if (typeof value === 'string') {
    if (value.includes('\u0000')) {
      context.addIssue({
        code: 'custom',
        path: [...path],
        message: 'Expected a text without the character U+0000',
      });
    }
    const member: string | number | undefined = path.at(-1);
    if (
      typeof member === 'string' &&
      DATE_MEMBERS.has(member) &&
      CALENDAR_DATE.exec(value)?.[1] === '0000'
    ) {
      context.addIssue({
        code: 'custom',
        path: [...path],
        message: 'Expected a date from the year 0001',
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index: number): void => {
      refuseUnstorableValues(context, item, [...path, index]);
    });
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, member] of Object.entries(value)) {
      refuseUnstorableValues(context, member, [...path, key]);
    }
  }
}
