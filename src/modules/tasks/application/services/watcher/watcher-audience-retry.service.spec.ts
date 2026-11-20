import { describe, expect, it, vi } from 'vitest';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { WatcherAudienceChanged } from '../../models/watcher/watcher-audience-changed.model.js';
import { withWatcherAudienceRetry } from './watcher-audience-retry.service.js';

/** Counts attempts while executing their preflight bodies. */
function trackSavepoints() {
  const attempt = vi.fn<() => void>();
  const store: Pick<TasksStore, 'savepoint'> = {
    savepoint: (work) => {
      attempt();
      return work();
    },
  };
  return { store, attempt };
}

describe('watcher audience preflight', () => {
  it('starts a new savepoint for a changed audience and stops after three attempts', async () => {
    const { store, attempt } = trackSavepoints();
    const work = vi.fn<() => Promise<void>>().mockRejectedValue(new WatcherAudienceChanged());

    await expect(withWatcherAudienceRetry(store, work)).rejects.toBeInstanceOf(
      WatcherAudienceChanged,
    );
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(work).toHaveBeenCalledTimes(3);
  });

  it('propagates another preflight failure on the first attempt', async () => {
    const { store, attempt } = trackSavepoints();
    const refusal = new Error('A stale task version');
    const work = vi.fn<() => Promise<void>>().mockRejectedValue(refusal);

    await expect(withWatcherAudienceRetry(store, work)).rejects.toBe(refusal);
    expect(attempt).toHaveBeenCalledOnce();
  });
});
