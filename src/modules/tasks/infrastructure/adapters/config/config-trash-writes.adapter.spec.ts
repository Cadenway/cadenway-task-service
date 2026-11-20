import { describe, expect, it } from 'vitest';

import { ConfigTrashWrites } from './config-trash-writes.adapter.js';

describe('ConfigTrashWrites: the switch of the writes of the trash from the configuration', () => {
  it.each([true, false])('answers TRASH_WRITES_ENABLED as read at start-up (%s)', (enabled) => {
    expect(new ConfigTrashWrites(enabled).isEnabled()).toBe(enabled);
  });
});
