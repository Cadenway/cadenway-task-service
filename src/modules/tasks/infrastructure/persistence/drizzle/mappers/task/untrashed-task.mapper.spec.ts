import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import { parentTasks } from './same-archive.mapper.js';
import { untrashedTask } from './untrashed-task.mapper.js';

describe('untrashedTask: the one condition of a task out of the trash', () => {
  it('leaves the tasks in the trash out, live or archived alike', () => {
    expect(renderSql(untrashedTask())).toEqual({
      sql: '"tasks"."trash_entry_id" is null',
      params: [],
    });
  });

  it('applies to an alias of tasks, the parent of a task', () => {
    expect(renderSql(untrashedTask(parentTasks))).toEqual({
      sql: '"parent_tasks"."trash_entry_id" is null',
      params: [],
    });
  });
});
