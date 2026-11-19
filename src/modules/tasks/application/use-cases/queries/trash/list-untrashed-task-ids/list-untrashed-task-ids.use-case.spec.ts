import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  CAD_482,
  CAD_483,
  CAD_490,
  InMemoryTasks,
  OTHER_ORGANIZATION,
  archiveFrom,
  cad490State,
  subtaskState,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { ListUntrashedTaskIds } from './list-untrashed-task-ids.use-case.js';

/** An id no task has. */
const ERASED: string = '019a7200-0000-7000-8000-0000000004ff';

/**
 * Builds the query on Atelier Nord: CAD-482 in the trash, CAD-483 live and CAD-490 archived.
 *
 * @returns The fake store and the query.
 */
function atelierNord(): { readonly tasks: InMemoryTasks; readonly query: ListUntrashedTaskIds } {
  const tasks = new InMemoryTasks({
    tasks: [
      taskState({ trash: trashIn(), version: 13 }),
      subtaskState({ parentId: null, parentKey: null }),
      cad490State({ archive: archiveFrom(CAD_490), version: 2 }),
    ],
  });
  return { tasks, query: new ListUntrashedTaskIds(tasks) };
}

describe('ListUntrashedTaskIds: which tasks are out of the trash, for the drop of their requests', () => {
  it('answers the live and archived tasks among the ids, never one in the trash or erased', async () => {
    const { query } = atelierNord();

    const output = await query.execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_482, CAD_483, CAD_490, ERASED],
    });

    expect(new Set(output.taskIds)).toEqual(new Set([CAD_483, CAD_490]));
  });

  it('locks the tasks of the ids for share, those in the trash included, in one statement', async () => {
    const { tasks, query } = atelierNord();

    const output = await query.execute({
      organizationId: ATELIER_NORD,
      taskIds: [CAD_490, CAD_482, CAD_483],
    });

    expect(output.taskIds).toEqual([CAD_483, CAD_490]);
    expect(tasks.trace).toEqual(['tasks.lockUntrashedIds:share']);
    expect(tasks.events).toEqual([]);
  });

  it('reads only the organization of the caller and writes nothing', async () => {
    const { tasks, query } = atelierNord();

    expect(await query.execute({ organizationId: OTHER_ORGANIZATION, taskIds: [CAD_483] })).toEqual(
      { taskIds: [] },
    );
    expect(tasks.trace).toEqual(['tasks.lockUntrashedIds:share']);
    expect(tasks.events).toEqual([]);
  });

  it('leaves out an id that is not a UUID and reads nothing for no id', async () => {
    const { tasks, query } = atelierNord();

    expect(await query.execute({ organizationId: ATELIER_NORD, taskIds: ['CAD-483', ''] })).toEqual(
      { taskIds: [] },
    );
    expect(await query.execute({ organizationId: ATELIER_NORD, taskIds: [] })).toEqual({
      taskIds: [],
    });
    expect(tasks.runs).toBe(0);
  });

  it('reads an id written in capitals as the task it names', async () => {
    const { query } = atelierNord();

    expect(
      await query.execute({ organizationId: ATELIER_NORD, taskIds: [CAD_483.toUpperCase()] }),
    ).toEqual({ taskIds: [CAD_483] });
  });

  it('refuses more than 2,000 ids before any read, a defect of the caller', async () => {
    const { tasks, query } = atelierNord();

    await expect(
      query.execute({
        organizationId: ATELIER_NORD,
        taskIds: Array.from({ length: 2001 }, (): string => CAD_483),
      }),
    ).rejects.toThrow('At most 2000 tasks are read at once, 2001 were asked for.');
    expect(tasks.runs).toBe(0);
  });
});
