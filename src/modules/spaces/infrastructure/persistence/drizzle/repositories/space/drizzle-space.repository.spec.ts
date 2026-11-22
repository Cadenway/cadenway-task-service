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
      'left join (select distinct "list_grants"."space_id" from "list_grants" inner join "lists" on "lists"."organization_id" = "list_grants"."organization_id" and "lists"."id" = "list_grants"."list_id" where "list_grants"."organization_id" = $3 and "list_grants"."user_id" = $4 and public.organization_member_grant_is_effective("list_grants"."organization_id", "list_grants"."user_id", "list_grants"."member_id", "list_grants"."granted_at") and "lists"."deleted_at" is null) as "viewer_list_spaces" on "viewer_list_spaces"."space_id" = "spaces"."id"',
    );
    expect(text).not.toContain('exists');
  });
});

describe('DrizzleSpaceRepository: a tombstone answers as an unknown space, but to the trash and the clean-up', () => {
  /** The condition that leaves the tombstones out. */
  const UNDELETED = '"spaces"."deleted_at" is null';

  it('leaves the tombstones out of a reading by id and of the locks before a change', async () => {
    const { spaces, statements } = capturing();

    await spaces.find(ORGANIZATION, PRODUIT);
    await spaces.lock(ORGANIZATION, PRODUIT);
    await spaces.lockShared(ORGANIZATION, PRODUIT);

    for (const { text } of statements) {
      expect(text).toContain(UNDELETED);
    }
    expect(statements[1]?.text.endsWith('for no key update')).toBe(true);
    expect(statements[2]?.text.endsWith('for share')).toBe(true);
  });

  it('orders the spaces a member sees by their position in the sidebar, after a position', async () => {
    const { spaces, statements } = capturing();

    await spaces.listVisible(
      ORGANIZATION,
      { userId: LEA, role: 'member' },
      { createdAt: new Date('2026-11-09T09:05:00.000Z'), id: PRODUIT },
      51,
    );

    const text: string = statements[0]?.text ?? '';
    expect(text).toContain(`(${UNDELETED} and not "spaces"."awaiting_owner"`);
    expect(text).toMatch(
      /\(coalesce\("spaces"\."restored_at", "spaces"\."created_at"\), "spaces"\."id"\) > \(\$\d+::timestamptz, \$\d+::uuid\)/u,
    );
    expect(text).toContain(
      'order by coalesce("spaces"."restored_at", "spaces"."created_at") asc, "spaces"."id" asc',
    );
  });

  it('reads and locks a space in any state for the trash, in the lock mode asked', async () => {
    const { spaces, statements } = capturing();

    await spaces.findIncludingDeleted(ORGANIZATION, PRODUIT);
    await spaces.lockIncludingDeleted(ORGANIZATION, PRODUIT, 'update');
    await spaces.lockIncludingDeleted(ORGANIZATION, PRODUIT, 'delete');
    await spaces.lockIncludingDeleted(ORGANIZATION, PRODUIT, 'share');

    for (const { text } of statements) {
      expect(text).not.toContain('deleted_at" is');
    }
    expect(statements[0]?.text).not.toContain(' for ');
    expect(statements[1]?.text.endsWith('for no key update')).toBe(true);
    expect(statements[2]?.text.endsWith('for update')).toBe(true);
    expect(statements[3]?.text.endsWith('for share')).toBe(true);
  });

  it('locks the spaces of the clean-up of a member, deleted ones included', async () => {
    const { spaces, statements } = capturing([[PRODUIT]]);

    await spaces.lockInOrder(ORGANIZATION, [{ id: PRODUIT, mode: 'update' }]);
    await spaces.lockPrivateOwnedBy(ORGANIZATION, LEA, 100);
    await spaces.lockAwaitingOwner(ORGANIZATION);

    for (const { text } of statements) {
      expect(text).not.toContain('deleted_at" is');
    }
  });

  it('erases a tombstone only, by its primary key', async () => {
    const { spaces, statements } = capturing();

    await expect(spaces.erase(ORGANIZATION, PRODUIT)).rejects.toThrow(
      'The deleted space to erase is not a tombstone.',
    );

    expect(statements[0]?.text.startsWith('delete from "spaces"')).toBe(true);
    expect(statements[0]?.text).toContain('"spaces"."deleted_at" is not null');
  });
});

describe('DrizzleSpaceRepository: lockInOrder locks in the order of the handover, each in its mode', () => {
  it('binds a large collection of spaces as one array', async () => {
    const { spaces, statements } = capturing();
    const ids: string[] = Array.from(
      { length: 65_536 },
      (_, index: number): string =>
        `00000000-0000-0000-0000-${index.toString(16).padStart(12, '0')}`,
    );

    await spaces.lockInOrder(
      ORGANIZATION,
      ids.map((id: string) => ({ id, mode: 'share' as const })),
    );

    expect(statements[0]?.text).toContain('"spaces"."id" = any($2::uuid[])');
    expect(statements[0]?.values).toEqual([ORGANIZATION, ids]);
  });

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
