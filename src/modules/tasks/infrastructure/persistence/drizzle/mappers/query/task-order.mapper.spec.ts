import { describe, expect, it } from 'vitest';

import type { TaskOrder } from '../../../../../application/models/query/task-order.model.js';
import type { TaskPosition } from '../../../../../application/models/query/task-position.model.js';
import { foldedSql, renderSql } from './query-sql.fixture.js';
import { keysetAfterOrder, orderTerms, sortValueExpression } from './task-order.mapper.js';

const INSTANT: string = '2026-11-02T09:00:00.000Z';
const CREATED: string = '"tasks"."created_at", "tasks"."id"';
const DUE: string = '"tasks"."due_date"';
const RANK: string =
  "array_position(array['urgente', 'haute', 'moyenne', 'basse']::text[], \"tasks\".\"priority\")";
const NAME: string = `left(${foldedSql('"tasks"."name"')}, 128) collate "C"`;

/**
 * Builds a position of the previous page.
 *
 * @param sortValue - The sort value of the last task.
 * @returns The position.
 */
function after(sortValue: string | number | null): TaskPosition {
  return { sortValue, createdAt: new Date(INSTANT), id: 'last' };
}

/**
 * Builds an order.
 *
 * @param key - The key.
 * @param descending - Whether a leading minus reverses it.
 * @returns The order.
 */
function order(key: TaskOrder['key'], descending: boolean): TaskOrder {
  return { key, descending };
}

describe('orderTerms: the order by of a page', () => {
  it.each([
    ['manual', false, CREATED],
    ['createdAt', false, CREATED],
    ['manual', true, '"tasks"."created_at" desc, "tasks"."id" desc'],
    ['createdAt', true, '"tasks"."created_at" desc, "tasks"."id" desc'],
    ['dueDate', false, `coalesce(${DUE}, 'infinity'::date), ${CREATED}`],
    ['dueDate', true, `coalesce(${DUE}, '-infinity'::date) desc, ${CREATED}`],
    ['priority', false, `${RANK}, ${CREATED}`],
    ['priority', true, `${RANK} desc, ${CREATED}`],
    ['name', false, `${NAME}, ${CREATED}`],
    ['name', true, `${NAME} desc, ${CREATED}`],
  ] as const)(
    'writes %s (descending %s) with the creation as tie-breaker',
    (key, descending, expected) => {
      expect(renderSql(orderTerms(order(key, descending))).sql).toBe(expected);
    },
  );

  it('reverses only the key under a minus, so the ties stay in the ascending order of the list', () => {
    expect(renderSql(orderTerms(order('priority', true))).sql.endsWith(`desc, ${CREATED}`)).toBe(
      true,
    );
  });

  it('puts the tasks without a due date last in both directions', () => {
    expect(renderSql(orderTerms(order('dueDate', false))).sql).toContain("'infinity'::date");
    expect(renderSql(orderTerms(order('dueDate', true))).sql).toContain("'-infinity'::date) desc");
  });
});

describe('sortValueExpression: what a position carries', () => {
  it.each([
    ['manual', 'null::text'],
    ['createdAt', 'null::text'],
    ['dueDate', `${DUE}::text`],
    ['priority', RANK],
    ['name', NAME],
  ] as const)('selects the value of %s', (key, expected) => {
    expect(renderSql(sortValueExpression(order(key, false))).sql).toBe(expected);
  });

  it('keeps the first 128 code points of the folded name, as the cursor can carry', () => {
    expect(renderSql(sortValueExpression(order('name', false))).sql).toContain(', 128)');
  });
});

describe('keysetAfterOrder: strictly after the last row of the previous page', () => {
  it('adds no condition on the first page', () => {
    expect(keysetAfterOrder(order('name', false), null)).toBeUndefined();
  });

  it('compares the creation and the id for the order of the list, in both directions', () => {
    expect(renderSql(keysetAfterOrder(order('manual', false), after(null)))).toEqual({
      sql: `(${CREATED}) > ($1::timestamptz, $2::uuid)`,
      params: [INSTANT, 'last'],
    });
    expect(renderSql(keysetAfterOrder(order('createdAt', true), after(null)))).toEqual({
      sql: `(${CREATED}) < ($1::timestamptz, $2::uuid)`,
      params: [INSTANT, 'last'],
    });
  });

  it('compares the due date as a row value when ascending', () => {
    expect(renderSql(keysetAfterOrder(order('dueDate', false), after('2026-11-05')))).toEqual({
      sql: `(coalesce(${DUE}, 'infinity'::date), ${CREATED}) > ($1::date, $2::timestamptz, $3::uuid)`,
      params: ['2026-11-05', INSTANT, 'last'],
    });
  });

  it('continues after the undated tasks with infinity when ascending', () => {
    expect(renderSql(keysetAfterOrder(order('dueDate', false), after(null)))).toEqual({
      sql: `(coalesce(${DUE}, 'infinity'::date), ${CREATED}) > ('infinity'::date, $1::timestamptz, $2::uuid)`,
      params: [INSTANT, 'last'],
    });
  });

  it('reverses the due date alone when descending, the tie staying ascending', () => {
    const key: string = `coalesce(${DUE}, '-infinity'::date)`;

    expect(renderSql(keysetAfterOrder(order('dueDate', true), after('2026-11-05')))).toEqual({
      sql: `(${key} < $1::date or (${key} = $2::date and ("tasks"."created_at", "tasks"."id") > ($3::timestamptz, $4::uuid)))`,
      params: ['2026-11-05', '2026-11-05', INSTANT, 'last'],
    });
  });

  it('continues after the undated tasks with minus infinity when descending', () => {
    const key: string = `coalesce(${DUE}, '-infinity'::date)`;

    expect(renderSql(keysetAfterOrder(order('dueDate', true), after(null)))).toEqual({
      sql: `(${key} < '-infinity'::date or (${key} = '-infinity'::date and ("tasks"."created_at", "tasks"."id") > ($1::timestamptz, $2::uuid)))`,
      params: [INSTANT, 'last'],
    });
  });

  it('compares the rank of the priority in both directions', () => {
    expect(renderSql(keysetAfterOrder(order('priority', false), after(2)))).toEqual({
      sql: `(${RANK}, ${CREATED}) > ($1::int, $2::timestamptz, $3::uuid)`,
      params: [2, INSTANT, 'last'],
    });
    expect(renderSql(keysetAfterOrder(order('priority', true), after(2)))).toEqual({
      sql: `(${RANK} < $1::int or (${RANK} = $2::int and ("tasks"."created_at", "tasks"."id") > ($3::timestamptz, $4::uuid)))`,
      params: [2, 2, INSTANT, 'last'],
    });
  });

  it('compares the folded name prefix in the C collation in both directions', () => {
    expect(renderSql(keysetAfterOrder(order('name', false), after('abc')))).toEqual({
      sql: `(${NAME}, ${CREATED}) > ($1::text collate "C", $2::timestamptz, $3::uuid)`,
      params: ['abc', INSTANT, 'last'],
    });
    expect(renderSql(keysetAfterOrder(order('name', true), after('abc')))).toEqual({
      sql: `(${NAME} < $1::text collate "C" or (${NAME} = $2::text collate "C" and ("tasks"."created_at", "tasks"."id") > ($3::timestamptz, $4::uuid)))`,
      params: ['abc', 'abc', INSTANT, 'last'],
    });
  });

  it.each([
    ['priority', 'abc'],
    ['priority', null],
    ['name', 3],
    ['name', null],
    ['dueDate', 4],
  ] as const)('refuses a position of the wrong shape for %s (%s)', (key, value) => {
    expect(() => keysetAfterOrder(order(key, false), after(value))).toThrow(
      `The position does not fit the order ${key}.`,
    );
  });
});
