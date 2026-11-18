import { describe, expect, it } from 'vitest';

import { CreateTaskBody } from './create-task-body.dto.js';

describe('the body of a task creation', () => {
  it('applies the defaults of the contract', () => {
    expect(CreateTaskBody.schema.parse({ name: 'Ajouter la connexion' })).toStrictEqual({
      name: 'Ajouter la connexion',
      status: 'todo',
      priority: 'moyenne',
      assigneeIds: [],
      labels: [],
      subtasks: [],
    });
  });

  it('drops the members the contract does not declare', () => {
    const body = CreateTaskBody.schema.parse({ name: 'a', key: 'CAD-1', version: 3 });

    expect(body).not.toHaveProperty('key');
    expect(body).not.toHaveProperty('version');
  });

  it('refuses a blank name, a blank subtask name and a blank label, each on its member', () => {
    const result = CreateTaskBody.schema.safeParse({
      name: '   ',
      subtasks: [{ name: 'ok' }, { name: '  ' }],
      labels: ['auth', ' '],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual([
        ['name'],
        ['subtasks', 1, 'name'],
        ['labels', 1],
      ]);
      expect(JSON.stringify(result.error.issues)).not.toContain('"   "');
    }
  });

  it('refuses U+0000 in a text and the year 0000 in a date, on the member', () => {
    const result = CreateTaskBody.schema.safeParse({
      name: 'a\u0000b',
      dueDate: '0000-01-01',
      description: 'x\u0000',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([['name'], ['dueDate'], ['description']]),
      );
    }
  });

  it('refuses more than 25 subtasks and more than 20 labels', () => {
    expect(
      CreateTaskBody.schema.safeParse({
        name: 'a',
        subtasks: Array.from({ length: 26 }, () => ({ name: 'x' })),
      }).success,
    ).toBe(false);
    expect(
      CreateTaskBody.schema.safeParse({
        name: 'a',
        labels: Array.from({ length: 21 }, (_, index) => `l${String(index)}`),
      }).success,
    ).toBe(false);
  });
});
