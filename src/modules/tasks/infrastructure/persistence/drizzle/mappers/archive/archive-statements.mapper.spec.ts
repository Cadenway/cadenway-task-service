import { describe, expect, it } from 'vitest';

import {
  ARCHIVED_AT,
  CAD_482,
  CAD_483,
  NOW,
  archiveFrom,
  subtaskState,
  taskState,
} from '../../../../../domain/tasks.fixture.js';
import { renderSql } from '../query/query-sql.fixture.js';
import {
  archiveMemberCountsStatement,
  archivedRootsCountStatement,
  archivedRootsPageStatement,
  liveRootCountsStatement,
  writeArchivesStatement,
} from './archive-statements.mapper.js';

const ROOTS: string =
  '("tasks"."organization_id" = $1 and "tasks"."archive_root" and "tasks"."list_id" = any($2::uuid[]))';
const ARCHIVE_COLUMNS: string =
  `to_char("tasks"."archived_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "archivedAt", ` +
  '"tasks"."archived_by_type" as "archivedByType", "tasks"."archived_by_id" as "archivedById"';

describe('archivedRootsPageStatement: a page of the roots of the archives', () => {
  it('reads the roots of the visible lists with the predicate of the partial index, the latest first', () => {
    const rendered = renderSql(archivedRootsPageStatement('org', ['l1', 'l2'], null, 51));

    expect(rendered.sql).toContain(
      `, ${ARCHIVE_COLUMNS} from "tasks" where ${ROOTS} order by "tasks"."archived_at" desc, "tasks"."id" desc limit $3`,
    );
    expect(rendered.sql).toContain('"tasks"."key_prefix" as "keyPrefix"');
    expect(rendered.params).toEqual(['org', ['l1', 'l2'], 51]);
  });

  it('continues strictly before the instant and the id of the previous page', () => {
    const rendered = renderSql(
      archivedRootsPageStatement('org', ['l1'], { archivedAt: ARCHIVED_AT, id: CAD_482 }, 8),
    );

    expect(rendered.sql).toContain(
      `where ${ROOTS} and ("tasks"."archived_at", "tasks"."id") < ($3::timestamptz, $4::uuid) order by`,
    );
    expect(rendered.params).toEqual(['org', ['l1'], ARCHIVED_AT.toISOString(), CAD_482, 8]);
  });
});

describe('archivedRootsCountStatement: the total of the archived tasks', () => {
  it('counts with the condition of the page', () => {
    expect(renderSql(archivedRootsCountStatement('org', ['l1']))).toEqual({
      sql: `select count(*)::int as "total" from "tasks" where ${ROOTS}`,
      params: ['org', ['l1']],
    });
  });
});

describe('archiveMemberCountsStatement: the size of each archive', () => {
  it('counts the members of the roots of the page in one grouped scan of the member index', () => {
    expect(renderSql(archiveMemberCountsStatement('org', [CAD_482]))).toEqual({
      sql:
        'select "tasks"."archive_root_id" as "rootId", count(*)::int as "members" from "tasks" ' +
        'where ("tasks"."organization_id" = $1 and "tasks"."archive_root_id" is not null and "tasks"."archive_root_id" = any($2::uuid[])) ' +
        'group by "tasks"."archive_root_id"',
      params: ['org', [CAD_482]],
    });
  });
});

describe('liveRootCountsStatement: the task count of an archived list', () => {
  it('counts the live top-level tasks of each list', () => {
    expect(renderSql(liveRootCountsStatement('org', ['l1']))).toEqual({
      sql:
        'select "tasks"."list_id" as "listId", count(*)::int as "total" from "tasks" ' +
        'where ("tasks"."organization_id" = $1 and "tasks"."list_id" = any($2::uuid[]) and "tasks"."parent_id" is null and "tasks"."archived_at" is null) ' +
        'group by "tasks"."list_id"',
      params: ['org', ['l1']],
    });
  });
});

describe('writeArchivesStatement: an archive or a restoration in one statement', () => {
  it('writes the archive, the parent, the version and the instant, guarded by the previous version', () => {
    const rendered = renderSql(
      writeArchivesStatement('org', [
        taskState({ archive: archiveFrom(CAD_482), version: 13, updatedAt: NOW }),
        subtaskState({ archive: archiveFrom(CAD_482), version: 2, updatedAt: NOW }),
      ]),
    );

    expect(rendered.sql).toBe(
      'update "tasks" set archived_at = changed.archived_at, archived_by_type = changed.archived_by_type, ' +
        'archived_by_id = changed.archived_by_id, archive_root_id = changed.archive_root_id, archive_root = coalesce(changed.archive_root_id = changed.id, false), parent_id = changed.parent_id, ' +
        'version = changed.version, updated_at = changed.updated_at ' +
        'from unnest($1::uuid[], $2::timestamptz[], $3::text[], $4::text[], $5::uuid[], $6::uuid[], $7::int[], $8::timestamptz[]) ' +
        'as changed (id, archived_at, archived_by_type, archived_by_id, archive_root_id, parent_id, version, updated_at) ' +
        'where "tasks"."organization_id" = $9::uuid and "tasks"."id" = changed.id and "tasks"."version" = changed.version - 1',
    );
    expect(rendered.params).toEqual([
      [CAD_482, CAD_483],
      [ARCHIVED_AT.toISOString(), ARCHIVED_AT.toISOString()],
      ['user', 'user'],
      [archiveFrom(CAD_482).by.id, archiveFrom(CAD_482).by.id],
      [CAD_482, CAD_482],
      [null, CAD_482],
      ['13', '2'],
      [NOW.toISOString(), NOW.toISOString()],
      'org',
    ]);
  });

  it('clears the four archive columns and the parent of a detached root', () => {
    const rendered = renderSql(
      writeArchivesStatement('org', [
        subtaskState({ parentId: null, parentKey: null, version: 3 }),
      ]),
    );

    expect(rendered.params.slice(1, 6)).toEqual([[null], [null], [null], [null], [null]]);
  });
});
