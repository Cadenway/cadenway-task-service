import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { DrizzleCustomFieldRepository } from './drizzle-custom-field.repository.js';

describe('DrizzleCustomFieldRepository.valuesForTaskPage', () => {
  it('binds each authorized task to its original space while checking the current task space', async () => {
    const statements: { readonly text: string; readonly values: readonly unknown[] }[] = [];
    const client = {
      query: (
        config: { readonly text: string },
        values: readonly unknown[] = [],
      ): Promise<{ rows: readonly never[] }> => {
        statements.push({ text: config.text, values });
        return Promise.resolve({ rows: [] });
      },
    };
    const repository = new DrizzleCustomFieldRepository(drizzle(client as unknown as Pool));

    await repository.valuesForTaskPage('organization', [
      { taskId: 'task-a', spaceId: 'space-a' },
      { taskId: 'task-b', spaceId: 'space-b' },
    ]);

    expect(statements).toHaveLength(1);
    const statement = statements[0];
    expect(statement?.text).toContain('"space_custom_fields"."space_id" = "tasks"."space_id"');
    expect(statement?.text).toContain('authorized.task_id = "task_custom_field_values"."task_id"');
    expect(statement?.text).toContain('authorized.space_id = "space_custom_fields"."space_id"');
    expect(statement?.values).toContainEqual(['task-a', 'task-b']);
    expect(statement?.values).toContainEqual(['space-a', 'space-b']);
    expect(statement?.values).toContain('organization');
  });
});
