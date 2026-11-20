import { describe, expect, it } from 'vitest';

import {
  ATELIER_NORD,
  BUGS,
  CAD_482,
  CAD_482_ENTRY,
  CAMILLE,
  InMemorySpaceDirectory,
  InMemoryTasks,
  LEA,
  NADIA,
  NOW,
  SPRINT_14,
  TRASH_WRITES_OFF,
  TRASH_WRITES_ON,
  atelierNordLists,
  atelierNordMembers,
  cad490State,
  refusalOf,
  storedEntry,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { EmptyTrash } from './empty-trash.use-case.js';

/** The entry of CAD-490, deleted from Bugs. */
const BUGS_ENTRY: string = '019a7006-7a8b-7c9d-8e0f-1a2b3c4d5e06';

/** Camille Martin, the actor of the specs. */
const camille = { type: 'user', id: CAMILLE } as const;

/**
 * Builds a use case on Atelier Nord with an entry in Sprint 14 and one in Bugs.
 *
 * @param spaces - The fake spaces.
 * @returns The fake store and the use case.
 */
function atelierNord(spaces: InMemorySpaceDirectory = new InMemorySpaceDirectory()): {
  readonly tasks: InMemoryTasks;
  readonly useCase: EmptyTrash;
} {
  const tasks = new InMemoryTasks({
    tasks: [
      taskState({ trash: trashIn(), version: 13 }),
      cad490State({ listId: BUGS, trash: trashIn(BUGS_ENTRY), version: 2 }),
    ],
    trashEntries: [
      storedEntry({ taskCount: 1 }),
      storedEntry({ id: BUGS_ENTRY, rootTaskId: cad490State().id, listId: BUGS, taskCount: 1 }),
    ],
  });
  return { tasks, useCase: new EmptyTrash(TRASH_WRITES_ON, tasks, atelierNordMembers(), spaces) };
}

describe('EmptyTrash: "Vider la corbeille" hands every entry the actor may restore to the purge', () => {
  it('hands the entries over with the instant and the actor, and enqueues one purge job', async () => {
    const { tasks, useCase } = atelierNord();

    expect(await useCase.execute({ organizationId: ATELIER_NORD, actorUserId: CAMILLE })).toEqual({
      entryCount: 2,
    });
    expect(tasks.trashEntries.get(CAD_482_ENTRY)?.purgeRequest).toEqual({ at: NOW, by: camille });
    expect(tasks.jobs).toEqual([{ queue: 'task.purge-trash' }]);
    expect(tasks.stored(CAD_482).trash).toEqual(trashIn());
  });

  it('leaves the entries of the lists the actor may not restore, deleted lists included as if not', async () => {
    const spaces = new InMemorySpaceDirectory({
      lists: atelierNordLists({ organizationAccess: false }),
      listGrants: { [SPRINT_14]: { [LEA]: 'edit' } },
      deletedLists: { [SPRINT_14]: camille },
    });
    const { tasks, useCase } = atelierNord(spaces);

    expect(await useCase.execute({ organizationId: ATELIER_NORD, actorUserId: LEA })).toEqual({
      entryCount: 2,
    });

    const guest = atelierNord(
      new InMemorySpaceDirectory({ listGrants: { [SPRINT_14]: { [NADIA]: 'edit' } } }),
    );
    expect(
      await guest.useCase.execute({ organizationId: ATELIER_NORD, actorUserId: NADIA }),
    ).toEqual({ entryCount: 1 });
    expect(guest.tasks.trashEntries.get(BUGS_ENTRY)?.purgeRequest).toBeNull();
    expect(tasks.jobs).toHaveLength(1);
  });

  it('enqueues nothing when no entry left the trash, and reads no entry without a list', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ trace });
    const useCase = new EmptyTrash(
      TRASH_WRITES_ON,
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    expect(await useCase.execute({ organizationId: ATELIER_NORD, actorUserId: CAMILLE })).toEqual({
      entryCount: 0,
    });
    expect(tasks.jobs).toEqual([]);

    const guest = new InMemoryTasks({ trace: [] });
    const nothing = new EmptyTrash(
      TRASH_WRITES_ON,
      guest,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
    );
    expect(await nothing.execute({ organizationId: ATELIER_NORD, actorUserId: NADIA })).toEqual({
      entryCount: 0,
    });
    expect(guest.trace).not.toContain('trash.requestPurge');
  });

  it('hands an entry over once: a second call finds none left in the trash', async () => {
    const { tasks, useCase } = atelierNord();

    await useCase.execute({ organizationId: ATELIER_NORD, actorUserId: CAMILLE });

    expect(await useCase.execute({ organizationId: ATELIER_NORD, actorUserId: CAMILLE })).toEqual({
      entryCount: 0,
    });
    expect(tasks.jobs).toHaveLength(1);
  });
});

describe('EmptyTrash: while the switch of the writes of the trash is off', () => {
  it('refuses first, reading nothing and handing nothing over', async () => {
    const trace: string[] = [];
    const tasks = new InMemoryTasks({ trace, trashEntries: [storedEntry({ taskCount: 1 })] });
    const useCase = new EmptyTrash(
      TRASH_WRITES_OFF,
      tasks,
      atelierNordMembers([], trace),
      new InMemorySpaceDirectory({ trace }),
    );

    expect(
      await refusalOf(useCase.execute({ organizationId: ATELIER_NORD, actorUserId: CAMILLE })),
    ).toEqual({ reason: 'trash-writes-disabled' });
    expect(trace).toEqual([]);
    expect(tasks.runs).toBe(0);
    expect(tasks.trashEntries.get(CAD_482_ENTRY)?.purgeRequest).toBeNull();
  });
});
