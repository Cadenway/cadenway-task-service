import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DrizzleTaskListRepository } from './drizzle-task-list.repository.js';

/** The organization of the statements. */
const ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The viewer of the statements, Léa Petit. */
const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/**
 * Builds the repository on a client that records each statement and answers no row.
 *
 * @returns The repository and the statements it sent.
 */
function capturing(): { readonly lists: DrizzleTaskListRepository; readonly texts: string[] } {
  const texts: string[] = [];
  const client = {
    query: (config: { readonly text: string }): Promise<{ rows: unknown[]; fields: unknown[] }> => {
      texts.push(config.text);
      return Promise.resolve({ rows: [], fields: [] });
    },
  };
  return {
    lists: new DrizzleTaskListRepository(drizzle(client as unknown as Pool)),
    texts,
  };
}

/**
 * Counts the occurrences of a text.
 *
 * @param text - Where to count.
 * @param part - What to count.
 * @returns The count.
 */
function count(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('DrizzleTaskListRepository: the collections read each grant of the viewer once, by join', () => {
  it('reads the lists of the sidebar in one statement with two left joins on the primary keys', async () => {
    const { lists, texts } = capturing();

    await lists.listFirstVisibleTo(ORGANIZATION, { userId: LEA, role: 'member' }, 20);

    expect(texts).toHaveLength(1);
    const text: string = texts[0] ?? '';
    expect(text).toContain(
      'left join "space_grants" "viewer_space_grant" on "viewer_space_grant"."organization_id" = $1 and "viewer_space_grant"."space_id" = "spaces"."id" and "viewer_space_grant"."user_id" = $2',
    );
    expect(text).toContain(
      'left join "list_grants" "viewer_list_grant" on "viewer_list_grant"."organization_id" = $3 and "viewer_list_grant"."list_id" = "lists"."id" and "viewer_list_grant"."user_id" = $4',
    );
    expect(count(text, '"list_grants"')).toBe(1);
    expect(count(text, '"space_grants"')).toBe(1);
    expect(text).not.toContain('(select');
  });

  it('reads the lean rows of the roles without the name, the look or the sprint of the lists', async () => {
    const { lists, texts } = capturing();

    await lists.listAccessesVisibleTo(ORGANIZATION, { userId: LEA, role: 'guest' });

    const text: string = texts[0] ?? '';
    expect(text).toContain('"lists"."organization_access"');
    expect(text).not.toContain('"lists"."name"');
    expect(text).not.toContain('"lists"."sprint_goal"');
    expect(count(text, '"list_grants"')).toBe(1);
    expect(text).toContain('"viewer_list_grant"."role" is not null');
  });

  it('applies the same joins to the lists of one space and to the sprints under way', async () => {
    const { lists, texts } = capturing();

    await lists.listAllOfSpaceVisibleTo(ORGANIZATION, '019a7000-0000-7000-8000-000000000001', {
      userId: LEA,
      role: 'member',
    });
    await lists.listCurrentSprintsVisibleTo(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      '2026-11-08',
      10,
    );

    for (const text of texts) {
      expect(text).toContain('left join "list_grants" "viewer_list_grant"');
      expect(text).toContain('left join "space_grants" "viewer_space_grant"');
      expect(text).not.toContain('(select');
    }
  });
});
