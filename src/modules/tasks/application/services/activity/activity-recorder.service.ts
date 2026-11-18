import {
  coalesceActivity,
  coalesces,
} from '../../../domain/policies/activity/activity-coalescing.policy.js';
import type { ActivityEntryDraft } from '../../../domain/value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { ActivityWrite } from '../../../domain/value-objects/activity/activity-write.value-object.js';
import type { ActivityRepository } from '../../ports/outbound/persistence/activity/activity-repository.port.js';

/**
 * Class ActivityRecorder
 *
 * @description
 * Writes the entries a change produced. The entries of a kind that coalesces (priority and due
 * date) go through the policy of the domain against the latest entry of the same kind for the task:
 * it says whether to insert, merge into that entry or delete it. The caller holds the lock of the
 * task, which serializes the merges, and passes the transaction instant.
 */
export class ActivityRecorder {
  // #region Methods
  /**
   * Method record
   *
   * @description
   * Writes the drafts: the ones that coalesce one after the other, the others in one statement.
   *
   * @param {ActivityRepository} activity - The entries of the transaction.
   * @param {readonly ActivityEntryDraft[]} drafts - The entries `ActivityEntry` drafted.
   * @returns {Promise<void>} Resolves once written.
   */
  public async record(
    activity: ActivityRepository,
    drafts: readonly ActivityEntryDraft[],
  ): Promise<void> {
    const inserts: ActivityEntryDraft[] = [];
    for (const draft of drafts) {
      if (!coalesces(draft.change.kind)) {
        inserts.push(draft);
        continue;
      }
      const candidate: ActivityEntryState | null = await activity.latestOfKind(
        draft.organizationId,
        draft.taskId,
        draft.change.kind,
      );
      const write: ActivityWrite = coalesceActivity(draft, candidate);
      if (write.action === 'insert') {
        inserts.push(write.entry);
      } else if (write.action === 'update') {
        await activity.update(write.entry);
      } else {
        await activity.remove(write.entry.organizationId, write.entry.id);
      }
    }
    if (inserts.length > 0) {
      await activity.insert(inserts);
    }
  }
  // #endregion
}
