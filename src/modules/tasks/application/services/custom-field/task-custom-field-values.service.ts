import type { Task } from '../../../domain/aggregates/task/task.aggregate.js';
import { CustomFieldError } from '../../../domain/errors/custom-field/custom-field.error.js';
import { planCustomFieldValueChanges } from '../../../domain/policies/custom-field/custom-field-values.policy.js';
import type { CustomFieldValueChange } from '../../../domain/value-objects/custom-field/custom-field-value-change.value-object.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';
import type { TasksStore } from '../../models/transactions/tasks-store.model.js';

/** Coordinates sparse values with task updates in their existing tenant transaction. */
export class TaskCustomFieldValues {
  // #region Methods
  /** Plans a patch after the destination space is held, without writing anything. */
  public async plan(
    store: TasksStore,
    before: Task,
    resultingSpaceId: string,
    patch: Readonly<Record<string, number | string | null>> | undefined,
  ): Promise<readonly CustomFieldValueChange[]> {
    if (patch === undefined) return [];
    const { organizationId, id, spaceId } = before.snapshot;
    const definitions = await store.customFields.activeDefinitions(
      organizationId,
      resultingSpaceId,
    );
    const values =
      spaceId === resultingSpaceId
        ? await store.customFields.valuesForTasks(organizationId, spaceId, [id])
        : [];
    const current = Object.fromEntries(values.map(({ fieldId, value }) => [fieldId, value]));
    try {
      return planCustomFieldValueChanges(resultingSpaceId, definitions, current, patch);
    } catch (error: unknown) {
      if (error instanceof CustomFieldError && error.reason === 'value-invalid') {
        throw new TaskRefusal({ reason: 'custom-field-value-invalid' });
      }
      throw error;
    }
  }

  /** Finds moved tasks with visible values in bounded pages across all source spaces. */
  public async movedWithValues(
    store: TasksStore,
    tasks: readonly Task[],
    destinationSpaceId: string,
  ): Promise<ReadonlySet<string>> {
    const moved = tasks.filter((task) => task.snapshot.spaceId !== destinationSpaceId);
    const result = new Set<string>();
    for (let offset = 0; offset < moved.length; offset += 500) {
      const batch = moved.slice(offset, offset + 500);
      const first = batch[0];
      if (first === undefined) continue;
      const values = await store.customFields.valuesForTaskPage(
        first.snapshot.organizationId,
        batch.map(({ snapshot }) => ({
          taskId: snapshot.id,
          spaceId: snapshot.spaceId,
          listId: snapshot.listId,
        })),
      );
      for (const value of values) result.add(value.taskId);
    }
    return result;
  }

  /** Clears moved task values in bounded batches within the caller's transaction. */
  public async clearMoved(
    store: TasksStore,
    tasks: readonly Task[],
    destinationSpaceId: string,
  ): Promise<void> {
    const moved = tasks.filter((task) => task.snapshot.spaceId !== destinationSpaceId);
    for (let offset = 0; offset < moved.length; offset += 500) {
      const batch = moved.slice(offset, offset + 500);
      const first = batch[0];
      if (first !== undefined) {
        await store.customFields.clearTasks(
          first.snapshot.organizationId,
          batch.map((task) => task.snapshot.id),
        );
      }
    }
  }
  // #endregion
}
