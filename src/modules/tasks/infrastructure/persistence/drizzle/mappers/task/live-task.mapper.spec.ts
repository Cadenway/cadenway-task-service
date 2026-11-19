import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import { liveTask } from './live-task.mapper.js';
import { childTasks } from './subtree-statement.mapper.js';

describe('liveTask: the one condition of a live task', () => {
  it('leaves the archived tasks out', () => {
    expect(renderSql(liveTask())).toEqual({ sql: '"tasks"."archived_at" is null', params: [] });
  });

  it('applies to an alias of tasks, the child of a recursive step', () => {
    expect(renderSql(liveTask(childTasks))).toEqual({
      sql: '"child"."archived_at" is null',
      params: [],
    });
  });
});
