import { describe, expect, it } from 'vitest';

import { renderSql } from '../query/query-sql.fixture.js';
import { parentOfTask, sameArchiveAsParent } from './same-archive.mapper.js';

describe('sameArchiveAsParent: the subtasks of a task are those of its archive', () => {
  it('joins the parent by its primary key in the same organization', () => {
    expect(renderSql(parentOfTask()).sql).toBe(
      '"parent_tasks"."organization_id" = "tasks"."organization_id" and "parent_tasks"."id" = "tasks"."parent_id"',
    );
  });

  it('compares the archive roots with is not distinct from, so two live tasks match, and leaves the subtasks in the trash out', () => {
    expect(renderSql(sameArchiveAsParent()).sql).toBe(
      '("tasks"."archive_root_id" is not distinct from "parent_tasks"."archive_root_id" and "tasks"."trash_entry_id" is null)',
    );
  });
});
