import type { ActivityEntryState } from '../../../domain/value-objects/activity/activity-entry-state.value-object.js';
import type { TaskReader } from '../../ports/outbound/persistence/task/task-reader.port.js';
import type { ActivityEntryView } from '../../projections/activity/activity-entry-view.projection.js';
import type { TaskReferenceInListView } from '../../projections/task/task-reference-in-list.projection.js';

/**
 * Class ActivityViewBuilder
 *
 * @description
 * Adds to entries the task each is about, as it is now, reading all the references of a page in
 * one batch.
 */
export class ActivityViewBuilder {
  // #region Methods
  /**
   * Method build
   *
   * @description
   * Builds the views of a page of entries.
   *
   * @param {TaskReader} reader - The read side of the transaction.
   * @param {string} organizationId - The organization of the transaction.
   * @param {readonly ActivityEntryState[]} entries - The entries of the page.
   * @returns {Promise<readonly ActivityEntryView[]>} The views, in the order of the entries.
   * @throws {Error} When the task of an entry is missing, which the foreign key rules out.
   */
  public async build(
    reader: TaskReader,
    organizationId: string,
    entries: readonly ActivityEntryState[],
  ): Promise<readonly ActivityEntryView[]> {
    const taskIds: readonly string[] = [
      ...new Set<string>(entries.map((entry: ActivityEntryState): string => entry.taskId)),
    ];
    const references: ReadonlyMap<string, TaskReferenceInListView> =
      taskIds.length === 0 ? new Map() : await reader.references(organizationId, taskIds);
    return entries.map((entry: ActivityEntryState): ActivityEntryView => {
      const task: TaskReferenceInListView | undefined = references.get(entry.taskId);
      if (task === undefined) {
        throw new Error(
          `The activity entry ${entry.id} names the task ${entry.taskId}, which the organization does not hold.`,
        );
      }
      return {
        id: entry.id,
        occurredAt: entry.occurredAt,
        kind: entry.change.kind,
        actor: entry.actor,
        task: { key: task.key, name: task.name, status: task.status },
        listId: entry.listId,
        change: entry.change,
      };
    });
  }
  // #endregion
}
