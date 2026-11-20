import { describe, expect, it, vi } from 'vitest';

import { PurgeExpiredIntakeReceipts } from './purge-expired-intake-receipts.use-case.js';

describe(PurgeExpiredIntakeReceipts.name, () => {
  it('drains expired receipts in batches of at most 500', async () => {
    const deleteBatch = vi.fn<(limit: number) => Promise<number>>().mockResolvedValueOnce(500);
    deleteBatch.mockResolvedValueOnce(17);
    const purge = new PurgeExpiredIntakeReceipts({ deleteBatch });

    await expect(purge.execute(new AbortController().signal)).resolves.toBe(517);
    expect(deleteBatch.mock.calls).toEqual([[500], [500]]);
  });

  it('lets an interrupted job resume from committed batches', async () => {
    const controller = new AbortController();
    const stop = new Error('Job stopped');
    const deleteBatch = vi.fn(() => {
      controller.abort(stop);
      return Promise.resolve(500);
    });
    const purge = new PurgeExpiredIntakeReceipts({ deleteBatch });

    await expect(purge.execute(controller.signal)).rejects.toBe(stop);
    expect(deleteBatch).toHaveBeenCalledTimes(1);
  });
});
