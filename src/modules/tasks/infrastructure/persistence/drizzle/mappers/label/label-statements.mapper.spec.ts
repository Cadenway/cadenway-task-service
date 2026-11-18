import { describe, expect, it } from 'vitest';

import { foldedSql, renderSql } from '../query/query-sql.fixture.js';
import { labelPageStatement } from './label-statements.mapper.js';

const VISIBLE_HEAD: string = `select min("task_labels"."name" collate "C") as "name", ${foldedSql('"task_labels"."label_key"')} as "foldedKey", "task_labels"."label_key" as "labelKey" from "task_labels" join "tasks" on "tasks"."organization_id" = "task_labels"."organization_id" and "tasks"."id" = "task_labels"."task_id" where ("task_labels"."organization_id" = $1 and "tasks"."organization_id" = $2 and "tasks"."space_id" = any($3::uuid[])) group by "task_labels"."label_key"`;
const SORT_KEY: string = 'left("foldedKey", 128)';
const OUTER_HEAD: string = `with "visible_labels" as materialized (${VISIBLE_HEAD}) select "name", ${SORT_KEY} as "sortKey", "labelKey" from "visible_labels"`;
const ORDER: string = `order by ${SORT_KEY} collate "C", "labelKey" collate "C"`;

describe('labelPageStatement: a page of the labels of the visible tasks', () => {
  it('groups the visible rows by label key first, behind a materialized fence, the spelling taken from them only', () => {
    expect(renderSql(labelPageStatement('org', ['s1', 's2'], null, null, 51))).toEqual({
      sql: `${OUTER_HEAD} ${ORDER} limit $4`,
      params: ['org', 'org', ['s1', 's2'], 51],
    });
  });

  it('folds the key once per group, inside the materialized CTE, never in the outer query', () => {
    const rendered = renderSql(
      labelPageStatement('org', ['s1'], null, { sortKey: 'a', labelKey: 'a' }, 10),
    );
    const [subquery, outer] = rendered.sql.split(') select "name"');

    expect(subquery).toContain(foldedSql('"task_labels"."label_key"'));
    expect(outer).not.toContain('casefold(');
  });

  it('keeps the groups whose folded key contains the folded search, and none for an empty one', () => {
    const rendered = renderSql(labelPageStatement('org', ['s1'], 'Auth', null, 10));

    expect(rendered.sql).toBe(
      `${OUTER_HEAD} where (${foldedSql('$4')} <> '' and strpos("foldedKey", ${foldedSql('$5')}) > 0) ${ORDER} limit $6`,
    );
    expect(rendered.params).toEqual(['org', 'org', ['s1'], 'Auth', 'Auth', 10]);
  });

  it('continues after the cut folded key and the key of the previous page, in the C collation', () => {
    const rendered = renderSql(
      labelPageStatement('org', ['s1'], null, { sortKey: 'auth', labelKey: 'auth' }, 10),
    );

    expect(rendered.sql).toBe(
      `${OUTER_HEAD} where (${SORT_KEY} collate "C", "labelKey" collate "C") > ($4::text collate "C", $5::text collate "C") ${ORDER} limit $6`,
    );
    expect(rendered.params).toEqual(['org', 'org', ['s1'], 'auth', 'auth', 10]);
  });
});
