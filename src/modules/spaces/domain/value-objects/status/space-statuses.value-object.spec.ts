import { describe, expect, it } from 'vitest';

import { DEFAULT_SPACE_STATUSES } from './space-statuses.value-object.js';
import { STATUS_KEYS } from './status-key.value-object.js';

describe('DEFAULT_SPACE_STATUSES: a new space uses the ten statuses under their default label', () => {
  it('holds each status key, in the order of the workflow', () => {
    expect(Object.keys(DEFAULT_SPACE_STATUSES)).toEqual([...STATUS_KEYS]);
  });

  it('shows every status under its default label and in use', () => {
    for (const key of STATUS_KEYS) {
      expect(DEFAULT_SPACE_STATUSES[key]).toEqual({ name: null, hidden: false });
    }
  });

  it('cannot be changed by a space that starts from it', () => {
    expect(Object.isFrozen(DEFAULT_SPACE_STATUSES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SPACE_STATUSES.todo)).toBe(true);
  });
});
