import { STATUS_CATEGORY_BY_KEY as CONTRACT_STATUS_CATEGORY_BY_KEY } from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { STATUS_CATEGORY_BY_KEY } from './status-category.value-object.js';
import { STATUS_KEYS } from './status-key.value-object.js';

describe('STATUS_CATEGORY_BY_KEY: the three categories never change', () => {
  it('gives each status key the category of @cadenway/contracts', () => {
    expect(STATUS_CATEGORY_BY_KEY).toEqual(CONTRACT_STATUS_CATEGORY_BY_KEY);
  });

  it('gives a category to each of the ten status keys', () => {
    expect(Object.keys(STATUS_CATEGORY_BY_KEY)).toEqual([...STATUS_KEYS]);
  });
});
