import { describe, expect, it, vi } from 'vitest';

import { TaskKey } from '../../../../../domain/value-objects/task/task-key.value-object.js';
import type { TaskState } from '../../../../../domain/value-objects/task/task-state.value-object.js';
import type { ListCopyDestination } from '../../../../ports/outbound/spaces/list/list-copy-destination.port.js';
import type { BatchAssigneeRoles } from '../../../../ports/outbound/members/membership/batch-assignee-roles.port.js';
import {
  ATELIER_NORD,
  CAMILLE,
  CAMILLE_ACTOR,
  InMemorySpaceDirectory,
  InMemoryTasks,
  NADIA,
  NOW,
  SPRINT_14,
  archiveFrom,
  atelierNordMembers,
  placedList,
  placedSpace,
  queryTask,
  subtaskState,
  taskState,
  trashIn,
} from '../../../tasks.fixture.js';
import { DuplicateList } from './duplicate-list.use-case.js';

const COPY_LIST = '019a7100-0000-7000-8000-0000000000aa';

function fixture(sources: readonly TaskState[], actorUserId: string = CAMILLE) {
  const trace: string[] = [];
  const list = placedList({
    archivedAt: NOW,
    archivedBy: CAMILLE_ACTOR,
    version: 2,
    organizationAccess: false,
  });
  const copied = placedList({
    id: COPY_LIST,
    name: 'Sprint 14 (copie)',
    organizationAccess: false,
    sprint: null,
  });
  const tasks = new InMemoryTasks({ tasks: sources, trace });
  const space = placedSpace();
  const spaces = new InMemorySpaceDirectory({
    lists: [list],
    listGrants: { [SPRINT_14]: { [NADIA]: 'edit' } },
    spaces: [{ ...space, statuses: { ...space.statuses, testing: { hidden: true, name: null } } }],
    lastNumbers: { CAD: 495 },
    trace,
  });
  const destination = {
    create: vi.fn<ListCopyDestination['create']>().mockResolvedValue(copied),
  } satisfies ListCopyDestination;
  const roster = {
    hold: vi
      .fn<BatchAssigneeRoles['hold']>()
      .mockResolvedValue([{ userId: CAMILLE, role: 'owner' }]),
  } satisfies BatchAssigneeRoles;
  return {
    useCase: new DuplicateList(tasks, atelierNordMembers([], trace), spaces, destination, roster),
    input: { organizationId: ATELIER_NORD, actorUserId, listId: SPRINT_14, expectedVersions: [2] },
    tasks,
    spaces,
    destination,
    roster,
    copied,
    trace,
  };
}

describe('DuplicateList', () => {
  it('copies an archived list with all live levels, detached roots and the same organization switch', async () => {
    const root: TaskState = taskState({ status: 'testing' });
    const child: TaskState = subtaskState();
    const grandchild: TaskState = queryTask(1, { parentId: child.id, parentKey: child.key });
    const missing: TaskState = queryTask(2);
    const archived: TaskState = { ...missing, archive: archiveFrom(missing.id) };
    const detached: TaskState = queryTask(3, { parentId: missing.id, parentKey: missing.key });
    const trashed: TaskState = queryTask(4, { trash: trashIn() });
    const { useCase, tasks, input, roster, destination, copied, trace } = fixture([
      grandchild,
      archived,
      detached,
      child,
      root,
      trashed,
    ]);
    await expect(useCase.execute(input)).resolves.toEqual({ list: copied, taskCount: 4 });
    expect(roster.hold).toHaveBeenCalledTimes(1);
    expect(destination.create).toHaveBeenCalledWith(ATELIER_NORD, CAMILLE, SPRINT_14);
    const keys = ['CAD-496', 'CAD-497', 'CAD-498', 'CAD-499'];
    const clones = await tasks.run(({ tasks: store }) =>
      Promise.all(
        keys.map((key: string) => store.findByKey(ATELIER_NORD, TaskKey.parse(key), false)),
      ),
    );
    expect(
      clones.map((clone) => [
        clone?.snapshot.name,
        clone?.snapshot.parentKey?.format() ?? null,
        clone?.snapshot.listId,
      ]),
    ).toEqual([
      [root.name, null, COPY_LIST],
      [detached.name, null, COPY_LIST],
      [child.name, 'CAD-496', COPY_LIST],
      [grandchild.name, 'CAD-498', COPY_LIST],
    ]);
    expect(clones[0]?.snapshot.status).toBe('testing');
    expect(clones[0]?.snapshot.checklist.map(({ text, done }) => ({ text, done }))).toEqual(
      root.checklist.map(({ text, done }) => ({ text, done })),
    );
    expect(clones[0]?.snapshot.checklist.map(({ id }) => id)).not.toEqual(
      root.checklist.map(({ id }) => id),
    );
    expect(
      trace.filter((call: string): boolean =>
        ['tasks.insertMany', 'copies.insertChecklists'].includes(call),
      ),
    ).toEqual([
      'tasks.insertMany',
      'tasks.insertMany',
      'tasks.insertMany',
      'copies.insertChecklists',
    ]);
    expect(tasks.events.filter(({ kind }) => kind === 'created')).toHaveLength(4);
  });

  it('refuses the source limit before list creation, key allocation or changes', async () => {
    const { useCase, tasks, input, destination, roster, spaces } = fixture(
      Array.from({ length: 501 }, (_, index: number): TaskState => queryTask(index)),
    );
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'list-duplicate-limit-reached' },
    });
    expect(destination.create).not.toHaveBeenCalled();
    expect(roster.hold).not.toHaveBeenCalled();
    expect(spaces.allocateCalls).toEqual([]);
    expect(tasks.events).toEqual([]);
  });

  it('copies exactly 500 tasks with consecutive keys in the allocator’s supported batches', async () => {
    const { useCase, tasks, input, copied, spaces, trace } = fixture(
      Array.from({ length: 500 }, (_, index: number): TaskState => queryTask(index)),
    );
    await expect(useCase.execute(input)).resolves.toEqual({ list: copied, taskCount: 500 });
    expect(spaces.allocateCalls.map(({ count }) => count)).toEqual([
      ...Array<number>(19).fill(26),
      6,
    ]);
    expect(
      trace.filter((call: string): boolean => ['tasks.insert', 'tasks.insertMany'].includes(call)),
    ).toEqual(['tasks.insertMany']);
    expect(tasks.events.filter(({ kind }) => kind === 'created').map(({ key }) => key)).toEqual(
      Array.from({ length: 500 }, (_, index: number): string => `CAD-${String(496 + index)}`),
    );
  });

  it('requires edit on the space even with a direct edit grant on the list', async () => {
    const { useCase, input, destination, tasks } = fixture([], NADIA);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'role-insufficient', role: null },
    });
    expect(destination.create).not.toHaveBeenCalled();
    expect(tasks.events).toEqual([]);
  });

  it('checks the list version and rechecks access before any write', async () => {
    const { useCase, input, destination, spaces } = fixture([]);
    await expect(useCase.execute({ ...input, expectedVersions: [1] })).rejects.toMatchObject({
      refusal: { reason: 'version-mismatch', version: 2 },
    });
    spaces.revokedUnderLock.add(SPRINT_14);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(destination.create).not.toHaveBeenCalled();
  });
});
