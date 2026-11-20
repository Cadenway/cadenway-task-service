import { describe, expect, it, vi } from 'vitest';

import type { TaskTimeRepository } from '../../../../ports/outbound/persistence/time/task-time-repository.port.js';
import {
  ATELIER_NORD,
  CAD_482,
  CAMILLE,
  HUGO,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  atelierNordMembers,
  archiveFrom,
  refusalOf,
  sprint14SharedWith,
  taskState,
} from '../../../tasks.fixture.js';
import { DeleteTaskTimeEntry } from '../delete-task-time-entry/delete-task-time-entry.use-case.js';
import { ListTaskTimeEntries } from '../../../queries/time/list-task-time-entries/list-task-time-entries.use-case.js';
import { CreateTaskTimeEntry } from './create-task-time-entry.use-case.js';

const actor = { organizationId: ATELIER_NORD, actorUserId: CAMILLE, taskKey: 'CAD-482' };
const entry = {
  id: '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
  authorUserId: CAMILLE,
  minutes: 45,
  workDate: '2026-11-08',
  note: 'OAuth',
  createdAt: new Date('2026-11-08T08:05:00Z'),
};

function repository() {
  return {
    create: vi.fn().mockResolvedValue(entry),
    find: vi.fn().mockResolvedValue(entry),
    remove: vi.fn().mockResolvedValue(true),
    page: vi.fn().mockResolvedValue([entry]),
    totals: vi.fn().mockResolvedValue({ total: 1, totalMinutes: 45 }),
    statusHistoryPage: vi.fn().mockResolvedValue([]),
    observationTime: vi.fn().mockResolvedValue(entry.createdAt),
  } satisfies TaskTimeRepository;
}

describe('Task time operations', () => {
  it('normalizes notes and creates a log in the authorized task transaction', async () => {
    const time = repository();
    const tasks = InMemoryTasks.withCad482({ time });
    const create = new CreateTaskTimeEntry(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    const result = await create.execute({
      ...actor,
      minutes: 45,
      workDate: '2026-11-08',
      note: '  OAuth  ',
    });

    expect(result).toEqual({ ...entry, taskKey: 'CAD-482' });
    expect(time.create).toHaveBeenCalledWith(
      ATELIER_NORD,
      CAD_482,
      CAMILLE,
      45,
      '2026-11-08',
      'OAuth',
    );
    expect(tasks.runs).toBe(1);
  });

  it('refuses deletion by an editor who did not author the entry', async () => {
    const time = repository();
    const tasks = InMemoryTasks.withCad482({ time });
    const remove = new DeleteTaskTimeEntry(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );

    expect(
      await refusalOf(remove.execute({ ...actor, actorUserId: HUGO, timeEntryId: entry.id })),
    ).toEqual({ reason: 'time-entry-author-required' });
    expect(time.remove).not.toHaveBeenCalled();
  });

  it('rechecks the live task and edit role before allowing a cached creation to replay', async () => {
    const time = repository();
    const archived = new InMemoryTasks({
      tasks: [taskState({ archive: archiveFrom(CAD_482) })],
      time,
    });
    const archivedCreate = new CreateTaskTimeEntry(
      archived,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    expect(await refusalOf(archivedCreate.assertCanReplay(actor))).toEqual({
      reason: 'task-archived',
      key: 'CAD-482',
    });
    const tasks = InMemoryTasks.withCad482({ time });
    const viewerCreate = new CreateTaskTimeEntry(
      tasks,
      atelierNordMembers(),
      sprint14SharedWith({ [HUGO]: 'view' }),
    );
    expect(await refusalOf(viewerCreate.assertCanReplay({ ...actor, actorUserId: HUGO }))).toEqual({
      reason: 'role-insufficient',
      role: 'view',
    });
    expect(tasks.snapshotRuns).toBe(1);
    expect(time.create).not.toHaveBeenCalled();
  });

  it('reads totals in a snapshot and hides entries from a guest without access', async () => {
    const time = repository();
    const tasks = new InMemoryTasks({ tasks: [taskState()], time });
    const list = new ListTaskTimeEntries(tasks, atelierNordMembers(), new InMemorySpaceDirectory());

    const page = await list.execute({ ...actor, after: null, limit: 10 });
    expect(page).toEqual({
      items: [{ ...entry, taskKey: 'CAD-482' }],
      next: null,
      total: 1,
      totalMinutes: 45,
    });
    expect(tasks.snapshotRuns).toBe(1);
    expect(
      await refusalOf(list.execute({ ...actor, actorUserId: NADIA, after: null, limit: 10 })),
    ).toEqual({ reason: 'task-not-found' });
    expect(time.page).toHaveBeenCalledTimes(1);
  });
});
