import { describe, expect, it } from 'vitest';

import type {
  ListUntrashedTaskIds,
  ListUntrashedTaskIdsInput,
  ListUntrashedTaskIdsOutput,
} from '../../../../tasks/public/trash/list-untrashed-task-ids.js';
import { TasksUntrashedTasks } from './untrashed-tasks.adapter.js';

/** Organization "Atelier Nord". */
const ATELIER_NORD: string = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f';

/** CAD-482, restored from the trash. */
const CAD_482: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1482';

/** CAD-483, still in the trash. */
const CAD_483: string = '019a7002-3c4d-7e5f-8a6b-7c8d9e0f1483';

describe('TasksUntrashedTasks: the tasks out of the trash through ListUntrashedTaskIds', () => {
  it('asks for the tasks of the organization and answers those out of the trash', async () => {
    const inputs: ListUntrashedTaskIdsInput[] = [];
    const operation = {
      execute: (input: ListUntrashedTaskIdsInput): Promise<ListUntrashedTaskIdsOutput> => {
        inputs.push(input);
        return Promise.resolve({ taskIds: [CAD_482] });
      },
    } as unknown as ListUntrashedTaskIds;

    const untrashed = await new TasksUntrashedTasks(operation).untrashedOf(ATELIER_NORD, [
      CAD_482,
      CAD_483,
    ]);

    expect(inputs).toEqual([{ organizationId: ATELIER_NORD, taskIds: [CAD_482, CAD_483] }]);
    expect(untrashed).toEqual([CAD_482]);
  });

  it('reads more than 2,000 tasks 2,000 at a time, the bound of the operation, and joins the answers', async () => {
    const taskIds = Array.from(
      { length: 4_001 },
      (_, index) => `019a7002-3c4d-7e5f-8a6b-${String(index).padStart(12, '0')}`,
    );
    const inputs: ListUntrashedTaskIdsInput[] = [];
    const operation = {
      execute: (input: ListUntrashedTaskIdsInput): Promise<ListUntrashedTaskIdsOutput> => {
        inputs.push(input);
        return Promise.resolve({ taskIds: input.taskIds.slice(0, 1) });
      },
    } as unknown as ListUntrashedTaskIds;

    const untrashed = await new TasksUntrashedTasks(operation).untrashedOf(ATELIER_NORD, taskIds);

    expect(inputs.map((input) => input.taskIds.length)).toEqual([2_000, 2_000, 1]);
    expect(inputs.flatMap((input) => input.taskIds)).toEqual(taskIds);
    expect(untrashed).toEqual([taskIds[0], taskIds[2_000], taskIds[4_000]]);
  });

  it('asks nothing for no task', async () => {
    const operation = {
      execute: (): Promise<ListUntrashedTaskIdsOutput> =>
        Promise.reject(new Error('Not called for no task.')),
    } as unknown as ListUntrashedTaskIds;

    await expect(new TasksUntrashedTasks(operation).untrashedOf(ATELIER_NORD, [])).resolves.toEqual(
      [],
    );
  });
});
