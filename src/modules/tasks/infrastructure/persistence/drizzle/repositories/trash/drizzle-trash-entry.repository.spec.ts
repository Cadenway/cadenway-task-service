import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DrizzleTrashEntryRepository } from './drizzle-trash-entry.repository.js';

describe('DrizzleTrashEntryRepository.lockPart', () => {
  it('locks selected tasks and surviving references in one id-ordered statement, returning only selected tasks in tree order', async () => {
    const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
    const client = {
      query: (
        config: { readonly text: string },
        values: readonly unknown[] = [],
      ): Promise<{ rows: { id: string; depth: number | null }[] }> => {
        statements.push({ text: config.text, values });
        return Promise.resolve({
          rows: [
            { id: 'child', depth: 1 },
            { id: 'external-child', depth: null },
            { id: 'root', depth: 0 },
          ],
        });
      },
    };
    const repository = new DrizzleTrashEntryRepository(drizzle(client as unknown as Pool));

    expect(await repository.lockPart('organization', 'entry', 500)).toEqual(['root', 'child']);
    expect(statements).toHaveLength(1);
    const statement = statements[0];
    expect(statement?.text).toContain('picked as materialized');
    expect(statement?.text).toContain('join picked on child.parent_id = picked.id');
    expect(statement?.text).toContain('join picked on member.archive_root_id = picked.id');
    expect(statement?.text).toMatch(/order by "tasks"\."id" for update of "tasks"$/u);
    expect(statement?.values).toContain('organization');
    expect(statement?.values).toContain('entry');
    expect(statement?.values).toContain(500);
  });
});
