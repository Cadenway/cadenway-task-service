import { STATUS_KEYS as CONTRACT_STATUS_KEYS } from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { STATUS_KEYS } from './status-key.value-object.js';

describe('STATUS_KEYS: the ten status keys never change', () => {
  it('lists the status keys of @cadenway/contracts in the same order', () => {
    expect(STATUS_KEYS).toEqual(CONTRACT_STATUS_KEYS);
  });

  it('lists ten distinct keys', () => {
    expect(new Set(STATUS_KEYS).size).toBe(10);
  });
});
