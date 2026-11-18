import { describe, expect, it } from 'vitest';

import { foldedSql, renderSql } from '../query/query-sql.fixture.js';
import { labelPageStatement } from './label-statements.mapper.js';

const KEY: string = foldedSql('"task_labels"."label_key"');
const SORT_KEY: string = `${KEY} collate "C"`;
const HEAD: string = `select min("task_labels"."name" collate "C") as "name", ${SORT_KEY} as "sortKey", "task_labels"."label_key" as "labelKey" from "task_labels" join "tasks" on "tasks"."organization_id" = "task_labels"."organization_id" and "tasks"."id" = "task_labels"."task_id"`;
const TAIL: string =
  'group by "task_labels"."label_key" order by "sortKey", "task_labels"."label_key" collate "C"';

describe('labelPageStatement: a page of the labels of the visible tasks', () => {
  it('groups by label key over the tasks of the visible spaces, the spelling taken from them only', () => {
    expect(renderSql(labelPageStatement('org', ['s1', 's2'], null, null, 51))).toEqual({
      sql: `${HEAD} where ("task_labels"."organization_id" = $1 and "tasks"."organization_id" = $2 and "tasks"."space_id" = any($3::uuid[])) ${TAIL} limit $4`,
      params: ['org', 'org', ['s1', 's2'], 51],
    });
  });

  it('keeps the labels whose folded key contains the folded search', () => {
    const rendered = renderSql(labelPageStatement('org', ['s1'], 'Auth', null, 10));

    expect(rendered.sql).toContain(`and strpos(${KEY}, ${foldedSql('$4')}) > 0) ${TAIL} limit $5`);
    expect(rendered.params).toEqual(['org', 'org', ['s1'], 'Auth', 10]);
  });

  it('continues after the folded key and the key of the previous page, in the C collation', () => {
    const rendered = renderSql(
      labelPageStatement('org', ['s1'], null, { sortKey: 'auth', labelKey: 'auth' }, 10),
    );

    expect(rendered.sql).toContain(
      `and (${SORT_KEY}, "task_labels"."label_key" collate "C") > ($4::text collate "C", $5::text collate "C")) ${TAIL} limit $6`,
    );
    expect(rendered.params).toEqual(['org', 'org', ['s1'], 'auth', 'auth', 10]);
  });
});
