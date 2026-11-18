import { STATUS_CATEGORY_BY_KEY } from '@cadenway/contracts';
import { describe, expect, it } from 'vitest';

import { CLOSED_STATUS_KEYS, isClosedStatus } from './status-category.value-object.js';
import { STATUS_KEYS } from './status-key.value-object.js';

describe('The closed statuses match the category `closed` of @cadenway/contracts', () => {
  it('lists the keys of the category closed, in the order of the workflow', () => {
    expect(CLOSED_STATUS_KEYS).toEqual(
      STATUS_KEYS.filter((key) => STATUS_CATEGORY_BY_KEY[key] === 'closed'),
    );
  });

  it.each(STATUS_KEYS)('tells whether %s is closed as its category does', (key) => {
    expect(isClosedStatus(key)).toBe(STATUS_CATEGORY_BY_KEY[key] === 'closed');
  });
});
