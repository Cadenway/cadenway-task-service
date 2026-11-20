import { describe, expect, it, vi } from 'vitest';

import type { TaskParticipantDirectory } from '../../../../ports/outbound/members/membership/task-participant-directory.port.js';
import {
  ATELIER_NORD,
  CAMILLE,
  HUGO,
  NADIA,
  SPRINT_14,
  InMemorySpaceDirectory,
  InMemoryTasks,
  atelierNordMembers,
  taskState,
} from '../../../tasks.fixture.js';
import { ListTaskParticipants } from './list-task-participants.use-case.js';

/** The first page of a task in Sprint 14. */
const input = {
  organizationId: ATELIER_NORD,
  actorUserId: CAMILLE,
  taskKey: 'CAD-482',
  after: null,
  limit: 1,
};

describe('ListTaskParticipants', () => {
  it('requests one extra row in the same snapshot and returns a continuation position', async () => {
    const list = vi.fn<TaskParticipantDirectory['list']>().mockResolvedValue([
      { userId: CAMILLE, memberId: 'membership of Camille' },
      { userId: HUGO, memberId: 'membership of Hugo' },
    ]);
    const tasks = new InMemoryTasks({ tasks: [taskState()] });
    const participants = new ListTaskParticipants(
      tasks,
      atelierNordMembers(),
      new InMemorySpaceDirectory(),
      { list },
    );

    expect(await participants.execute(input)).toEqual({
      items: [{ userId: CAMILLE, memberId: 'membership of Camille' }],
      next: CAMILLE,
    });
    expect(list).toHaveBeenCalledWith(ATELIER_NORD, SPRINT_14, null, 2);
    expect(tasks.snapshotRuns).toBe(1);
  });

  it('refuses a view-only role before reading the participants', async () => {
    const list = vi.fn<TaskParticipantDirectory['list']>();
    const spaces = new InMemorySpaceDirectory({ listGrants: { [SPRINT_14]: { [NADIA]: 'view' } } });
    const participants = new ListTaskParticipants(
      new InMemoryTasks({ tasks: [taskState()] }),
      atelierNordMembers(),
      spaces,
      { list },
    );

    await expect(participants.execute({ ...input, actorUserId: NADIA })).rejects.toMatchObject({
      refusal: { reason: 'role-insufficient', role: 'view', requiredRole: 'comment' },
    });
    expect(list).not.toHaveBeenCalled();
  });
});
