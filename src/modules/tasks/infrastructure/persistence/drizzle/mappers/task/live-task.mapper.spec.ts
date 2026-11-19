import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import { liveTask } from './live-task.mapper.js';

describe('liveTask: the one condition of a live task', () => {
  it('leaves the archived tasks out', () => {
    expect(renderSql(liveTask())).toEqual({ sql: '"tasks"."archived_at" is null', params: [] });
  });
});
