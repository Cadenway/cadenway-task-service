import { describe, expect, it } from 'vitest';

import { ConfigTrashWrites } from './config-trash-writes.adapter.js';

describe('ConfigTrashWrites: the switch of the deletions follows the configuration', () => {
  it('answers the value of TRASH_WRITES_ENABLED, both ways', () => {
    expect(new ConfigTrashWrites(true).isEnabled()).toBe(true);
    expect(new ConfigTrashWrites(false).isEnabled()).toBe(false);
  });
});
