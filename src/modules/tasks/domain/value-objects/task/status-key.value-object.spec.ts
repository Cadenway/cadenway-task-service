import {
  CANCEL_REASONS as CONTRACT_CANCEL_REASONS,
  PRIORITY_KEYS as CONTRACT_PRIORITY_KEYS,
  STATUS_KEYS as CONTRACT_STATUS_KEYS,
} from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { CANCEL_REASONS } from './cancel-reason.value-object.js';
import { PRIORITY_KEYS } from './priority-key.value-object.js';
import { STATUS_KEYS } from './status-key.value-object.js';

describe('The closed sets the domain repeats match @cadenway/contracts', () => {
  it('lists the ten status keys of the contract in the same order', () => {
    expect(STATUS_KEYS).toEqual(CONTRACT_STATUS_KEYS);
  });

  it('lists the four priorities of the contract in the same order', () => {
    expect(PRIORITY_KEYS).toEqual(CONTRACT_PRIORITY_KEYS);
  });

  it('lists the four cancel reasons of the contract in the same order', () => {
    expect(CANCEL_REASONS).toEqual(CONTRACT_CANCEL_REASONS);
  });
});
