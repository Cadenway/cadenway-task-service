import { describe, expect, it } from 'vitest';

import { TaskPath } from './task-path.dto.js';

describe('the path of a task', () => {
  it.each(['CAD-482', 'AB-1', 'ABCDE-999999999'])('accepts the key %s', (taskKey: string) => {
    expect(TaskPath.schema.safeParse({ taskKey }).success).toBe(true);
  });

  it.each(['cad-482', 'CAD-0482', 'CAD-0', 'C-1', 'CADENWAY-1', 'CAD482', 'CAD-1234567890'])(
    'refuses the key %s',
    (taskKey: string) => {
      expect(TaskPath.schema.safeParse({ taskKey }).success).toBe(false);
    },
  );
});
