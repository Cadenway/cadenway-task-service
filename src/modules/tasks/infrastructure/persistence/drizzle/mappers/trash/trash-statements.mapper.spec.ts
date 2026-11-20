import { describe, expect, it } from 'vitest';

import {
  CAD_482,
  CAD_482_ENTRY,
  CAD_483,
  CAMILLE,
  NOW,
  SPRINT_14,
  TRASHED_AT,
  archiveFrom,
  subtaskState,
  taskState,
  trashIn,
} from '../../../../../domain/tasks.fixture.js';
import { renderSql } from '../query/query-sql.fixture.js';
import {
  dueEntriesStatement,
  eraseEntriesStatements,
  handedOverEntriesStatement,
  insertEntriesStatement,
  listsWithTasksStatement,
  lockInTrashOfListsStatement,
  organizationsWithTrashStatement,
  removeEntryStatement,
  requestPurgeStatement,
  trashCandidateRootsStatement,
  trashEntryStatement,
  trashPageStatement,
  trashTotalStatement,
  trashTreesStatement,
  untrashedIdsLockStatement,
  writeTrashStatement,
} from './trash-statements.mapper.js';

/** The select list of an entry with its root. */
const COLUMNS: string =
  '"entry"."id" as "id", "entry"."organization_id" as "organizationId", "entry"."root_task_id" as "rootTaskId", ' +
  '"entry"."list_id" as "listId", "entry"."parent_key" as "parentKey", "entry"."task_count" as "taskCount", ' +
  `to_char("entry"."trashed_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "trashedAt", ` +
  '"entry"."trashed_by_type" as "trashedByType", "entry"."trashed_by_id" as "trashedById", ' +
  `to_char("entry"."purge_requested_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "purgeRequestedAt", ` +
  '"entry"."purge_requested_by_type" as "purgeRequestedByType", "entry"."purge_requested_by_id" as "purgeRequestedById", ' +
  '("entry"."purge_root_key" is not null or "root"."id" is null) as "rootErased", ' +
  `coalesce(split_part("entry"."purge_root_key", '-', 1), "root"."key_prefix") as "rootKeyPrefix", ` +
  `coalesce(nullif(split_part("entry"."purge_root_key", '-', 2), '')::int, "root"."key_number") as "rootKeyNumber", ` +
  'coalesce("entry"."purge_root_name", "root"."name") as "rootName", coalesce("entry"."purge_root_status", "root"."status") as "rootStatus"';

/** The join of an entry with its root by the primary key of `tasks`. */
const FROM: string =
  'from "trash_entries" as "entry" left join "tasks" as "root" on "root"."organization_id" = "entry"."organization_id" and "root"."id" = "entry"."root_task_id"';

/** The entries of the lists still in the trash, the predicate of the partial index. */
const IN_TRASH: string =
  '"entry"."organization_id" = $1::uuid and "entry"."purge_requested_at" is null and "entry"."list_id" = any($2::uuid[])';

describe('trashEntryStatement: one entry with its root', () => {
  it('reads by primary key, locking the entry row only when asked', () => {
    expect(renderSql(trashEntryStatement('org', CAD_482_ENTRY, false))).toEqual({
      sql: `select ${COLUMNS} ${FROM} where "entry"."organization_id" = $1::uuid and "entry"."id" = $2::uuid`,
      params: ['org', CAD_482_ENTRY],
    });
    expect(renderSql(trashEntryStatement('org', CAD_482_ENTRY, true)).sql).toMatch(
      / for update of "entry"$/u,
    );
  });
});

describe('trashPageStatement and trashTotalStatement: the page of the trash and its total', () => {
  it('walks the entries still in the trash of the lists, the most recently deleted first', () => {
    expect(renderSql(trashPageStatement('org', [SPRINT_14], null, 51))).toEqual({
      sql: `select ${COLUMNS} ${FROM} where ${IN_TRASH} order by "entry"."trashed_at" desc, "entry"."id" desc limit $3`,
      params: ['org', [SPRINT_14], 51],
    });
  });

  it('continues strictly before the instant and the id of the previous page', () => {
    const rendered = renderSql(
      trashPageStatement('org', [SPRINT_14], { trashedAt: TRASHED_AT, id: CAD_482_ENTRY }, 8),
    );

    expect(rendered.sql).toContain(
      `where ${IN_TRASH} and ("entry"."trashed_at", "entry"."id") < ($3::timestamptz, $4::uuid) order by`,
    );
    expect(rendered.params).toEqual([
      'org',
      [SPRINT_14],
      TRASHED_AT.toISOString(),
      CAD_482_ENTRY,
      8,
    ]);
  });

  it('counts with the condition of the page', () => {
    expect(renderSql(trashTotalStatement('org', [SPRINT_14]))).toEqual({
      sql: `select count(*)::int as "total" from "trash_entries" as "entry" where ${IN_TRASH}`,
      params: ['org', [SPRINT_14]],
    });
  });
});

describe('lockInTrashOfListsStatement and requestPurgeStatement: "Vider la corbeille" locks the entries, then hands them over by id', () => {
  it('locks the entries of the lists still in the trash for update in one statement ordered by id', () => {
    expect(renderSql(lockInTrashOfListsStatement('org', [SPRINT_14]))).toEqual({
      sql:
        'select "trash_entries"."id" as "id", "trash_entries"."list_id" as "listId" from "trash_entries" ' +
        'where "trash_entries"."organization_id" = $1::uuid and "trash_entries"."purge_requested_at" is null and "trash_entries"."list_id" = any($2::uuid[]) ' +
        'order by "trash_entries"."id" for update',
      params: ['org', [SPRINT_14]],
    });
  });

  it('hands the entries given over by id, those still in the trash only, with the instant and the actor', () => {
    expect(
      renderSql(requestPurgeStatement('org', [CAD_482_ENTRY], NOW, { type: 'user', id: CAMILLE })),
    ).toEqual({
      sql:
        'update "trash_entries" set purge_requested_at = $1::timestamptz, purge_requested_by_type = $2, purge_requested_by_id = $3 ' +
        'where "trash_entries"."organization_id" = $4::uuid and "trash_entries"."purge_requested_at" is null and "trash_entries"."id" = any($5::uuid[])',
      params: [NOW.toISOString(), 'user', CAMILLE, 'org', [CAD_482_ENTRY]],
    });
  });
});

describe('handedOverEntriesStatement and dueEntriesStatement: the batches of the purge', () => {
  it('locks the oldest hand-overs first, skipping the entries another batch holds', () => {
    expect(renderSql(handedOverEntriesStatement('org', 20))).toEqual({
      sql: `select ${COLUMNS} ${FROM} where "entry"."organization_id" = $1::uuid and "entry"."purge_requested_at" is not null order by "entry"."purge_requested_at", "entry"."id" limit $2 for update of "entry" skip locked`,
      params: ['org', 20],
    });
  });

  it('locks the oldest entries deleted at or before the cut-off, still in the trash', () => {
    expect(renderSql(dueEntriesStatement('org', TRASHED_AT, 20))).toEqual({
      sql: `select ${COLUMNS} ${FROM} where "entry"."organization_id" = $1::uuid and "entry"."purge_requested_at" is null and "entry"."trashed_at" <= $2::timestamptz order by "entry"."trashed_at", "entry"."id" limit $3 for update of "entry" skip locked`,
      params: ['org', TRASHED_AT.toISOString(), 20],
    });
  });
});

describe('insertEntriesStatement: new entries in one statement, returned with their roots', () => {
  it('inserts from unnest and joins the rows it returns with their roots', () => {
    const rendered = renderSql(
      insertEntriesStatement([
        {
          organizationId: 'org',
          rootTaskId: CAD_482,
          listId: SPRINT_14,
          parentKey: null,
          taskCount: 3,
          trashedAt: NOW,
          trashedBy: { type: 'user', id: CAMILLE },
        },
      ]),
    );

    expect(rendered.sql).toBe(
      'with "entry" as (insert into "trash_entries" (organization_id, root_task_id, list_id, parent_key, task_count, trashed_at, trashed_by_type, trashed_by_id) ' +
        'select * from unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::int[], $6::timestamptz[], $7::text[], $8::text[]) returning *) ' +
        `select ${COLUMNS} from "entry" left join "tasks" as "root" on "root"."organization_id" = "entry"."organization_id" and "root"."id" = "entry"."root_task_id"`,
    );
    expect(rendered.params).toEqual([
      ['org'],
      [CAD_482],
      [SPRINT_14],
      [null],
      ['3'],
      [NOW.toISOString()],
      ['user'],
      [CAMILLE],
    ]);
  });
});

describe('removeEntryStatement and eraseEntriesStatements: the end of an entry', () => {
  it('deletes the row of a restored entry by primary key', () => {
    expect(renderSql(removeEntryStatement('org', CAD_482_ENTRY))).toEqual({
      sql: 'delete from "trash_entries" where "trash_entries"."organization_id" = $1::uuid and "trash_entries"."id" = $2::uuid',
      params: ['org', CAD_482_ENTRY],
    });
  });

  it('erases the collections, detaches the tasks outside, then deletes the tasks and the entries', () => {
    const statements = eraseEntriesStatements('org', [CAD_482_ENTRY]).map(
      (statement) => renderSql(statement).sql,
    );
    const tasksOf: string =
      'select "tasks"."id" from "tasks" where "tasks"."organization_id" = $2::uuid and "tasks"."trash_entry_id" = any($3::uuid[])';

    expect(statements).toEqual([
      `delete from "activity_entries" where "activity_entries"."organization_id" = $1::uuid and "activity_entries"."task_id" in (${tasksOf})`,
      `delete from "checklist_items" where "checklist_items"."organization_id" = $1::uuid and "checklist_items"."task_id" in (${tasksOf})`,
      `delete from "task_assignees" where "task_assignees"."organization_id" = $1::uuid and "task_assignees"."task_id" in (${tasksOf})`,
      `delete from "task_labels" where "task_labels"."organization_id" = $1::uuid and "task_labels"."task_id" in (${tasksOf})`,
      `update "tasks" set parent_id = null where "tasks"."organization_id" = $1::uuid and "tasks"."parent_id" in (${tasksOf}) and ("tasks"."trash_entry_id" is null or "tasks"."trash_entry_id" <> all($4::uuid[]))`,
      'delete from "tasks" where "tasks"."organization_id" = $1::uuid and "tasks"."trash_entry_id" = any($2::uuid[])',
      'delete from "trash_entries" where "trash_entries"."organization_id" = $1::uuid and "trash_entries"."id" = any($2::uuid[])',
    ]);
  });
});

describe('writeTrashStatement: a trash or a restoration in one statement', () => {
  it('writes the entry, the archive, the parent, the version and the instant, guarded by the version under the lock', () => {
    const rendered = renderSql(
      writeTrashStatement(
        'org',
        [
          taskState({ trash: trashIn(), version: 13, updatedAt: NOW }),
          subtaskState({ trash: trashIn(), version: 3, updatedAt: NOW }),
        ],
        [12, 2],
      ),
    );

    expect(rendered.sql).toBe(
      'update "tasks" set trash_entry_id = changed.trash_entry_id, archived_at = changed.archived_at, archived_by_type = changed.archived_by_type, ' +
        'archived_by_id = changed.archived_by_id, archive_root_id = changed.archive_root_id, archive_root = coalesce(changed.archive_root_id = changed.id, false), ' +
        'parent_id = changed.parent_id, version = changed.version, updated_at = changed.updated_at ' +
        'from unnest($1::uuid[], $2::uuid[], $3::timestamptz[], $4::text[], $5::text[], $6::uuid[], $7::uuid[], $8::int[], $9::int[], $10::timestamptz[]) ' +
        'as changed (id, trash_entry_id, archived_at, archived_by_type, archived_by_id, archive_root_id, parent_id, version, version_before, updated_at) ' +
        'where "tasks"."organization_id" = $11::uuid and "tasks"."id" = changed.id and "tasks"."version" = changed.version_before',
    );
    expect(rendered.params).toEqual([
      [CAD_482, CAD_483],
      [CAD_482_ENTRY, CAD_482_ENTRY],
      [null, null],
      [null, null],
      [null, null],
      [null, null],
      [null, CAD_482],
      ['13', '3'],
      ['12', '2'],
      [NOW.toISOString(), NOW.toISOString()],
      'org',
    ]);
  });

  it('writes the archive of a member archived again as of its restoration, two versions on', () => {
    const rendered = renderSql(
      writeTrashStatement(
        'org',
        [taskState({ archive: archiveFrom(CAD_482, { at: NOW }), version: 14 })],
        [12],
      ),
    );

    expect(rendered.params.slice(1, 6)).toEqual([
      [null],
      [NOW.toISOString()],
      ['user'],
      [archiveFrom(CAD_482).by.id],
      [CAD_482],
    ]);
    expect(rendered.params.slice(7, 9)).toEqual([['14'], ['12']]);
  });
});

describe('trashCandidateRootsStatement: the roots of the entries of a deleted list', () => {
  it('reads the tasks out of the trash that read as top-level, live or archived, in the order of the list', () => {
    expect(renderSql(trashCandidateRootsStatement('org', SPRINT_14, null, 50))).toEqual({
      sql:
        `select "tasks"."id" as "id", to_char("tasks"."created_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt" ` +
        'from "tasks" left join "tasks" as "parent_tasks" on "parent_tasks"."organization_id" = "tasks"."organization_id" and "parent_tasks"."id" = "tasks"."parent_id" ' +
        'where "tasks"."organization_id" = $1::uuid and "tasks"."list_id" = $2::uuid and "tasks"."trash_entry_id" is null ' +
        'and ("tasks"."parent_id" is null or "parent_tasks"."list_id" <> "tasks"."list_id" or not "parent_tasks"."trash_entry_id" is null) ' +
        'order by "tasks"."created_at", "tasks"."id" limit $3',
      params: ['org', SPRINT_14, 50],
    });
  });

  it('continues strictly after the position of the last root', () => {
    const rendered = renderSql(
      trashCandidateRootsStatement('org', SPRINT_14, { createdAt: TRASHED_AT, id: CAD_482 }, 50),
    );

    expect(rendered.sql).toContain(
      ' is null) and ("tasks"."created_at", "tasks"."id") > ($3::timestamptz, $4::uuid) order by',
    );
    expect(rendered.params).toEqual(['org', SPRINT_14, TRASHED_AT.toISOString(), CAD_482, 50]);
  });
});

describe('trashTreesStatement: the trees of the roots of entries in one statement', () => {
  it('walks each root out of the trash down its list, live or archived, at any depth, detecting a cycle', () => {
    expect(renderSql(trashTreesStatement('org', [CAD_482, CAD_483]))).toEqual({
      sql:
        'with recursive tree (id, root_id, list_id, depth) as (select "tasks"."id", "tasks"."id", "tasks"."list_id", 0 from "tasks" ' +
        'where "tasks"."organization_id" = $1::uuid and "tasks"."id" = any($2::uuid[]) and "tasks"."trash_entry_id" is null ' +
        'union all select "child"."id", tree.root_id, tree.list_id, tree.depth + 1 from tree ' +
        'join "tasks" as "child" on "child"."organization_id" = $3::uuid and "child"."parent_id" = tree.id ' +
        'where "child"."list_id" = tree.list_id and "child"."trash_entry_id" is null) ' +
        'cycle id set is_cycle using path ' +
        'select id, root_id as "rootId", depth::int as "depth", is_cycle as "isCycle" from tree order by root_id, depth, id',
      params: ['org', [CAD_482, CAD_483], 'org'],
    });
  });

  it('limits bulk discovery without sorting the recursive result', () => {
    const statement = renderSql(trashTreesStatement('org', [CAD_482], 1001));

    expect(statement.sql).toMatch(/from tree limit \$4$/);
    expect(statement.sql).not.toContain('order by');
    expect(statement.params).toEqual(['org', [CAD_482], 'org', 1001]);
  });
});

describe('untrashedIdsLockStatement: the tasks of the drop of requests, locked for share', () => {
  it('locks every task of the ids by primary key in id order, telling those out of the trash', () => {
    expect(renderSql(untrashedIdsLockStatement('org', [CAD_483, CAD_482]))).toEqual({
      sql:
        'select "tasks"."id" as "id", "tasks"."trash_entry_id" is null as "untrashed" from "tasks" ' +
        'where "tasks"."organization_id" = $1::uuid and "tasks"."id" = any($2::uuid[]) order by "tasks"."id" for share',
      params: ['org', [CAD_483, CAD_482]],
    });
  });
});

describe('listsWithTasksStatement: whether a list still holds a task', () => {
  it('probes each list once with exists', () => {
    expect(renderSql(listsWithTasksStatement('org', [SPRINT_14]))).toEqual({
      sql: 'select candidate.list_id as "listId" from unnest($1::uuid[]) as candidate (list_id) where exists (select 1 from "tasks" where "tasks"."organization_id" = $2::uuid and "tasks"."list_id" = candidate.list_id)',
      params: [[SPRINT_14], 'org'],
    });
  });

  it('counts the tasks out of the trash only when asked, the work left to a deletion job', () => {
    expect(renderSql(listsWithTasksStatement('org', [SPRINT_14], true))).toEqual({
      sql: 'select candidate.list_id as "listId" from unnest($1::uuid[]) as candidate (list_id) where exists (select 1 from "tasks" where "tasks"."organization_id" = $2::uuid and "tasks"."list_id" = candidate.list_id and "tasks"."trash_entry_id" is null)',
      params: [[SPRINT_14], 'org'],
    });
  });
});

describe('organizationsWithTrashStatement: the organizations with trash to erase', () => {
  /** Whether the organization of `alias` holds a hand-over or an entry due (`$n` the cut-off). */
  const qualifies = (alias: string, cutOff: number): string =>
    `(exists (select 1 from "trash_entries" as handed where handed.organization_id = ${alias}.organization_id and handed.purge_requested_at is not null) ` +
    `or exists (select 1 from "trash_entries" as due where due.organization_id = ${alias}.organization_id and due.purge_requested_at is null and due.trashed_at <= $${String(cutOff)}::timestamptz))`;

  it('walks the organizations one probe at a time and probes each for something to erase', () => {
    expect(renderSql(organizationsWithTrashStatement(TRASHED_AT, null, 1000))).toEqual({
      sql:
        'with recursive candidate (organization_id, qualifies, taken) as (' +
        'select head.organization_id, head.qualifies, head.qualifies::int from (' +
        `select first.organization_id, ${qualifies('first', 1)} as qualifies ` +
        'from (select organization_id from "trash_entries" as first order by organization_id limit 1) as first) as head ' +
        'union all select following.organization_id, following.qualifies, candidate.taken + following.qualifies::int from candidate ' +
        `cross join lateral (select next.organization_id, ${qualifies('next', 2)} as qualifies ` +
        'from (select organization_id from "trash_entries" as entry where entry.organization_id > candidate.organization_id order by organization_id limit 1) as next) as following ' +
        'where candidate.taken < $3) ' +
        'select organization_id as "organizationId" from candidate where qualifies order by organization_id limit $4',
      params: [TRASHED_AT.toISOString(), TRASHED_AT.toISOString(), 1000, 1000],
    });
  });

  it('starts after the last organization of the previous page', () => {
    const rendered = renderSql(organizationsWithTrashStatement(TRASHED_AT, 'org', 10));

    expect(rendered.sql).toContain(
      'from (select organization_id from "trash_entries" as first where first.organization_id > $2::uuid order by organization_id limit 1) as first',
    );
    expect(rendered.params).toEqual([
      TRASHED_AT.toISOString(),
      'org',
      TRASHED_AT.toISOString(),
      10,
      10,
    ]);
  });
});
