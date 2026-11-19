import { describe, expect, it } from 'vitest';

import type {
  TrashDeletedListTasks,
  TrashDeletedListTasksInput,
  TrashDeletedListTasksOutput,
} from '../../../../tasks/public/trash/trash-deleted-list-tasks.js';
import { TasksDeletedListTasks } from './deleted-list-tasks.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** The list "Sprint 14", deleted. */
const SPRINT_14: string = '019a7001-2b3c-7d4e-8f5a-6b7c8d9e0f14';

/** CAD-482, a top-level task of "Sprint 14". */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

/** When CAD-482 was created. */
const CREATED_AT: Date = new Date('2026-10-01T08:00:00.000Z');

/**
 * Builds the adapter on an operation that records its input and answers `output`.
 *
 * @param output - The answer of the operation.
 * @returns The adapter and the inputs.
 */
function adapterOn(output: TrashDeletedListTasksOutput): {
  readonly adapter: TasksDeletedListTasks;
  readonly inputs: TrashDeletedListTasksInput[];
} {
  const inputs: TrashDeletedListTasksInput[] = [];
  const operation = {
    execute: (input: TrashDeletedListTasksInput): Promise<TrashDeletedListTasksOutput> => {
      inputs.push(input);
      return Promise.resolve(output);
    },
  } as unknown as TrashDeletedListTasks;
  return { adapter: new TasksDeletedListTasks(operation), inputs };
}

describe('TasksDeletedListTasks: one batch of TrashDeletedListTasks', () => {
  it('asks for the first batch of the list, and maps a batch that moved tasks', async () => {
    const { adapter, inputs } = adapterOn({
      outcome: 'trashed',
      entries: 1,
      taskIds: [CAD_482],
      last: { createdAt: CREATED_AT, id: CAD_482 },
    });

    const batch = await adapter.trashBatch(ATELIER_NORD, SPRINT_14, null);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, listId: SPRINT_14, after: null }]);
    expect(batch).toEqual({
      outcome: 'trashed',
      entries: 1,
      taskIds: [CAD_482],
      last: { createdAt: CREATED_AT, id: CAD_482 },
    });
  });

  it('asks for the batch after the last root of the previous one', async () => {
    const { adapter, inputs } = adapterOn({ outcome: 'list-live' });

    const batch = await adapter.trashBatch(ATELIER_NORD, SPRINT_14, {
      createdAt: CREATED_AT,
      id: CAD_482,
    });

    expect(inputs[0]?.after).toEqual({ createdAt: CREATED_AT, id: CAD_482 });
    expect(batch).toEqual({ outcome: 'list-live' });
  });

  it('maps the end of a list with what was erased', async () => {
    const { adapter } = adapterOn({ outcome: 'none-left', listPurged: true, spacePurged: false });

    await expect(adapter.trashBatch(ATELIER_NORD, SPRINT_14, null)).resolves.toEqual({
      outcome: 'none-left',
      listPurged: true,
      spacePurged: false,
    });
  });
});
