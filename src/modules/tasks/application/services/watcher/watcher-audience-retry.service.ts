import type { TasksStore } from '../../models/transactions/tasks-store.model.js';
import { WatcherAudienceChanged } from '../../models/watcher/watcher-audience-changed.model.js';

/** The initial preflight plus two retries for concurrent changes in the audience. */
const MAX_ATTEMPTS = 3;

/** Retries a changed preflight after dropping the previous attempt's locks. */
export async function withWatcherAudienceRetry<TResult>(
  store: Pick<TasksStore, 'savepoint'>,
  work: () => Promise<TResult>,
): Promise<TResult> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await store.savepoint(work);
    } catch (error: unknown) {
      if (!(error instanceof WatcherAudienceChanged) || attempt >= MAX_ATTEMPTS) {
        throw error;
      }
    }
  }
}
