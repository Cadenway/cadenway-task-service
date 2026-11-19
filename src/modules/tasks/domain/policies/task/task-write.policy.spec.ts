import { describe, expect, it } from 'vitest';

import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import { canWriteTasksOf } from './task-write.policy.js';

describe('canWriteTasksOf: who has edit on a list creates and changes its tasks', () => {
  it('lets edit write the tasks of the list', () => {
    expect(canWriteTasksOf('edit')).toBe(true);
  });

  it.each(['comment', 'view'] as const)(
    'keeps %s to reading the tasks of the list',
    (role: AccessRole) => {
      expect(canWriteTasksOf(role)).toBe(false);
    },
  );

  it('refuses a role a later contract adds, as it reads as view', () => {
    expect(canWriteTasksOf('owner' as AccessRole)).toBe(false);
  });
});
