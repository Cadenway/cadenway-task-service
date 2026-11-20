import { describe, expect, it, vi } from 'vitest';

import { ReportingBatches } from './reporting-batch.service.js';

describe('ReportingBatches', () => {
  it('reads successive bounded pages within its caller transaction', async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ items: ['one', 'two'], next: 'two' })
      .mockResolvedValueOnce({ items: ['three'], next: null });
    await expect(new ReportingBatches().read(read)).resolves.toEqual(['one', 'two', 'three']);
    expect(read.mock.calls).toEqual([
      [null, 500],
      ['two', 500],
    ]);
  });
});
