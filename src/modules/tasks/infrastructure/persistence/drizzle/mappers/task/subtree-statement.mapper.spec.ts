import { describe, expect, it } from 'vitest';

import { ATELIER_NORD, CAD_482 } from '../../../../../domain/tasks.fixture.js';
import { renderSql } from '../query/query-sql.fixture.js';
import { subtreeStatement } from './subtree-statement.mapper.js';

describe('subtreeStatement: the live descendants of a task, three levels at most', () => {
  const { sql, params } = renderSql(subtreeStatement(ATELIER_NORD, CAD_482));

  it('keeps the live subtasks of the first level and of every recursive step, through liveTask', () => {
    expect(sql).toContain(
      '"tasks"."parent_id" = $2::uuid\n        and "tasks"."archived_at" is null',
    );
    expect(sql).toContain('join "tasks" as "child"');
    expect(sql).toContain('where tree.depth < 3 and "child"."archived_at" is null');
  });

  it('scopes both levels to the organization and walks the children by their parent', () => {
    expect(sql).toContain('"tasks"."organization_id" = $1::uuid');
    expect(sql).toContain('"child"."organization_id" = $3::uuid and "child"."parent_id" = tree.id');
    expect(params).toEqual([ATELIER_NORD, CAD_482, ATELIER_NORD]);
  });

  it('answers the descendants by depth then id', () => {
    expect(sql).toContain('select id, depth::int as depth from tree order by depth, id');
  });
});
