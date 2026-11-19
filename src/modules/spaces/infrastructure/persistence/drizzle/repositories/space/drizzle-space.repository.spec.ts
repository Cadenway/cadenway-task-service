import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DrizzleSpaceRepository } from './drizzle-space.repository.js';

/** The organization of the statements. */
const ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The viewer of the statements, Léa Petit. */
const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/** The space "Produit", created first. */
const PRODUIT = '019a7000-0000-7000-8000-000000000001';

/** The space "Design", created after Produit. */
const DESIGN = '019a7000-0000-7000-8000-000000000002';

/**
 * Builds the repository on a client that records each statement and its values, and answers the
 * rows given for the first statement, none for the next ones.
 *
 * @param firstRows - The rows of the first statement, as arrays of values.
 * @returns The repository and the statements it sent.
 */
function capturing(firstRows: readonly unknown[][] = []): {
  readonly spaces: DrizzleSpaceRepository;
  readonly statements: { readonly text: string; readonly values: readonly unknown[] }[];
} {
  const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
  const client = {
    query: (
      config: { readonly text: string },
      values: readonly unknown[] = [],
    ): Promise<{ rows: unknown[][]; fields: unknown[] }> => {
      statements.push({ text: config.text, values });
      return Promise.resolve({ rows: statements.length === 1 ? [...firstRows] : [], fields: [] });
    },
  };
  return {
    spaces: new DrizzleSpaceRepository(drizzle(client as unknown as Pool)),
    statements,
  };
}

describe('DrizzleSpaceRepository: the spaces a member sees, with their grants read by join', () => {
  it('reads the spaces in one statement, the grant of each by its primary key, the shared lists once', async () => {
    const { spaces, statements } = capturing();

    await spaces.listAllVisible(ORGANIZATION, { userId: LEA, role: 'member' });

    expect(statements).toHaveLength(1);
    const text: string = statements[0]?.text ?? '';
    expect(text).toContain(
      'left join "space_grants" "viewer_space_grant" on "viewer_space_grant"."organization_id" = $1 and "viewer_space_grant"."space_id" = "spaces"."id" and "viewer_space_grant"."user_id" = $2',
    );
    expect(text).toContain(
      'left join (select distinct "list_grants"."space_id" from "list_grants" where "list_grants"."organization_id" = $3 and "list_grants"."user_id" = $4) as "viewer_list_spaces" on "viewer_list_spaces"."space_id" = "spaces"."id"',
    );
    expect(text).not.toContain('exists');
  });
});

describe('DrizzleSpaceRepository: lockInOrder locks in the order of the handover, each in its mode', () => {
  it('reads the order first, then locks each space alone, for no key update or for share', async () => {
    const { spaces, statements } = capturing([[PRODUIT], [DESIGN]]);

    await spaces.lockInOrder(ORGANIZATION, [
      { id: DESIGN, mode: 'update' },
      { id: PRODUIT, mode: 'share' },
    ]);

    expect(statements).toHaveLength(3);
    expect(statements[0]?.text).toContain('order by "spaces"."created_at" asc, "spaces"."id" asc');
    expect(statements[0]?.text).not.toContain(' for ');
    expect(statements[1]?.text.endsWith('for share')).toBe(true);
    expect(statements[1]?.values).toContain(PRODUIT);
    expect(statements[2]?.text.endsWith('for no key update')).toBe(true);
    expect(statements[2]?.values).toContain(DESIGN);
  });

  it('sends nothing when there is nothing to lock', async () => {
    const { spaces, statements } = capturing();

    expect(await spaces.lockInOrder(ORGANIZATION, [])).toEqual([]);
    expect(statements).toEqual([]);
  });
});
