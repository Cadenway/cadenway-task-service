import { describe, expect, it } from 'vitest';

import type { TasksUnitOfWork } from '../../../../ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import {
  ATELIER_NORD,
  HUGO,
  InMemoryTasks,
  OTHER_ORGANIZATION,
  taskState,
} from '../../../tasks.fixture.js';
import { ScheduleMemberUnassignment } from './schedule-member-unassignment.use-case.js';

/** Membership of Hugo Dubois in Atelier Nord. */
const HUGO_MEMBERSHIP: string = '019a6b10-0000-7000-8000-000000000003';

/** The membership Hugo Dubois gets when he joins Atelier Nord again. */
const HUGO_NEW_MEMBERSHIP: string = '019a6b10-0000-7000-8000-000000000013';

describe('ScheduleMemberUnassignment: a removal enqueues one unassignment job and touches no task', () => {
  it('enqueues the job of the membership at its version in one unit of work, and writes no task, entry or event', async () => {
    const tasks = new InMemoryTasks({ tasks: [taskState({ assigneeIds: [HUGO] })] });

    const output = await new ScheduleMemberUnassignment(tasks).execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
      membershipVersion: 3,
    });

    expect(output).toEqual({ scheduled: true });
    expect(tasks.runs).toBe(1);
    expect(tasks.scheduled).toEqual([
      {
        organizationId: ATELIER_NORD,
        userId: HUGO,
        memberId: HUGO_MEMBERSHIP,
        membershipVersion: 3,
      },
    ]);
    expect(tasks.trace).toEqual(['unassignments.enqueue']);
    expect(tasks.events).toEqual([]);
    expect(tasks.activity.size).toBe(0);
    expect(tasks.stored(taskState().id).assigneeIds).toEqual([HUGO]);
  });

  it('enqueues nothing more for the same membership at the same version, so a redelivered removal is harmless', async () => {
    const tasks = new InMemoryTasks();
    const useCase = new ScheduleMemberUnassignment(tasks);
    const removal = {
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
      membershipVersion: 3,
    };

    await useCase.execute(removal);
    const again = await useCase.execute(removal);

    expect(again).toEqual({ scheduled: false });
    expect(tasks.scheduled).toHaveLength(1);
  });

  it('enqueues a job for the removal of a later membership of the same account, even at the same version', async () => {
    const tasks = new InMemoryTasks();
    const useCase = new ScheduleMemberUnassignment(tasks);

    await useCase.execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
      membershipVersion: 2,
    });
    const later = await useCase.execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_NEW_MEMBERSHIP,
      membershipVersion: 2,
    });

    expect(later).toEqual({ scheduled: true });
    expect(tasks.scheduled.map((job) => job.memberId)).toEqual([
      HUGO_MEMBERSHIP,
      HUGO_NEW_MEMBERSHIP,
    ]);
  });

  it('keeps the occurrences of two organizations apart', async () => {
    const tasks = new InMemoryTasks();
    const useCase = new ScheduleMemberUnassignment(tasks);

    await useCase.execute({
      organizationId: ATELIER_NORD,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
      membershipVersion: 2,
    });
    const other = await useCase.execute({
      organizationId: OTHER_ORGANIZATION,
      userId: HUGO,
      memberId: HUGO_MEMBERSHIP,
      membershipVersion: 2,
    });

    expect(other).toEqual({ scheduled: true });
    expect(tasks.scheduled).toHaveLength(2);
  });

  it('rejects when the job cannot be enqueued, so the transaction of the removal rolls back', async () => {
    const tasks = new InMemoryTasks();
    const failing: TasksUnitOfWork = {
      run: (work) =>
        tasks.run((store) =>
          work({
            ...store,
            unassignments: {
              enqueue: () => Promise.reject(new Error('The job table is unavailable.')),
            },
          }),
        ),
      runReadOnly: (work, options) => tasks.runReadOnly(work, options),
    };

    await expect(
      new ScheduleMemberUnassignment(failing).execute({
        organizationId: ATELIER_NORD,
        userId: HUGO,
        memberId: HUGO_MEMBERSHIP,
        membershipVersion: 3,
      }),
    ).rejects.toThrow('The job table is unavailable.');
    expect(tasks.scheduled).toEqual([]);
  });
});
