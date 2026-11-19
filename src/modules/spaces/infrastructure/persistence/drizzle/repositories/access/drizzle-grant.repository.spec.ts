import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DrizzleGrantRepository } from './drizzle-grant.repository.js';

/** The organization of the statements. */
const ORGANIZATION = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The viewer of the statements, Léa Petit. */
const LEA = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b33';

/** The space "Produit". */
const PRODUIT = '019a7000-0000-7000-8000-000000000001';

/** The sprint "Sprint 14". */
const SPRINT_14 = '019a7100-0000-7000-8000-000000000002';

/**
 * Builds the repository on a client that records each statement and answers one row of no grant.
 *
 * @returns The repository and the statements it sent.
 */
function capturing(): {
  readonly grants: DrizzleGrantRepository;
  readonly texts: string[];
} {
  const texts: string[] = [];
  const client = {
    query: (
      config: string | { readonly text: string },
    ): Promise<{ rows: unknown[]; fields: unknown[] }> => {
      texts.push(typeof config === 'string' ? config : config.text);
      return Promise.resolve({
        rows: [{ spaceRole: null, listRole: null, anyList: false }],
        fields: [],
      });
    },
  };
  return { grants: new DrizzleGrantRepository(drizzle(client as unknown as Pool)), texts };
}

describe('DrizzleGrantRepository: a grant of a deleted list shows no space', () => {
  it('reads whether the member holds a grant of a list of the space that is not deleted', async () => {
    const { grants, texts } = capturing();

    await grants.viewerGrants(ORGANIZATION, LEA, PRODUIT, SPRINT_14);

    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain(
      'exists (select 1 from "list_grants" inner join "lists" on "lists"."organization_id" = "list_grants"."organization_id" and "lists"."id" = "list_grants"."list_id" where',
    );
    expect(texts[0]).toContain('"lists"."deleted_at" is null) as "anyList"');
  });
});

describe('DrizzleGrantRepository: the erasure of a tombstone erases its grants', () => {
  it('deletes every grant of a list, then of a space, each by a range of its primary key', async () => {
    const { grants, texts } = capturing();

    await grants.eraseOfList(ORGANIZATION, SPRINT_14);
    await grants.eraseOfSpace(ORGANIZATION, PRODUIT);

    expect(texts[0]).toBe(
      'delete from "list_grants" where ("list_grants"."organization_id" = $1 and "list_grants"."list_id" = $2) returning "user_id"',
    );
    expect(texts[1]).toBe(
      'delete from "space_grants" where ("space_grants"."organization_id" = $1 and "space_grants"."space_id" = $2) returning "user_id"',
    );
  });
});
