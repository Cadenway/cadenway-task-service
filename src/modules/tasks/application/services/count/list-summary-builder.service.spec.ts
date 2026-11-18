import { describe, expect, it } from 'vitest';

import { BUGS, SPRINT_14, placedList } from '../../use-cases/tasks.fixture.js';
import type { TaskCountsView } from '../../projections/count/task-counts.projection.js';
import { ListSummaryBuilder } from './list-summary-builder.service.js';

describe('ListSummaryBuilder: lists get the counts of their tasks, zeros when they have none', () => {
  const sprint = placedList();
  const bugs = placedList({ id: BUGS, name: 'Bugs', sprint: null });
  const counts: TaskCountsView = { total: 98, open: 72, done: 24, cancelled: 2, late: 3 };

  it('pairs each list with its counts and keeps the order of the lists', () => {
    const summaries = new ListSummaryBuilder().build(
      [bugs, sprint],
      new Map([[SPRINT_14, counts]]),
    );

    expect(summaries.map((summary) => summary.list.id)).toEqual([BUGS, SPRINT_14]);
    expect(summaries[1]?.counts).toEqual(counts);
  });

  it('gives zeros to a list the counter left out', () => {
    const [summary] = new ListSummaryBuilder().build([bugs], new Map());

    expect(summary?.counts).toEqual({ total: 0, open: 0, done: 0, cancelled: 0, late: 0 });
  });

  it('answers nothing for no list', () => {
    expect(new ListSummaryBuilder().build([], new Map([[SPRINT_14, counts]]))).toEqual([]);
  });
});
