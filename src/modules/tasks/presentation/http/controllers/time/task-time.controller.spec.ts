import {
  CreateTaskTimeEntryInternalResponse,
  GetTaskStatusDurationsInternalResponse,
  ListTaskTimeEntriesInternalResponse,
} from '@cadenway/contracts/validators/internal/task-service';
import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { CreateTaskTimeEntry } from '../../../../application/use-cases/commands/time/create-task-time-entry/create-task-time-entry.use-case.js';
import type { DeleteTaskTimeEntry } from '../../../../application/use-cases/commands/time/delete-task-time-entry/delete-task-time-entry.use-case.js';
import type { GetTaskStatusDurations } from '../../../../application/use-cases/queries/time/get-task-status-durations/get-task-status-durations.use-case.js';
import type { GetTaskTimeEntry } from '../../../../application/use-cases/queries/time/get-task-time-entry/get-task-time-entry.use-case.js';
import type { GetTaskTimeSummary } from '../../../../application/use-cases/queries/time/get-task-time-summary/get-task-time-summary.use-case.js';
import type { ListTaskTimeEntries } from '../../../../application/use-cases/queries/time/list-task-time-entries/list-task-time-entries.use-case.js';
import { TaskTimeController } from './task-time.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const id = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const entry = {
  id,
  taskKey: 'CAD-482',
  authorUserId: actorUserId,
  minutes: 30,
  workDate: '2026-11-07',
  note: null,
  createdAt: new Date('2026-11-07T09:30:00.000Z'),
};

function asCamille<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: actorUserId }, role: null, scopes: [] },
    work,
  );
}

describe('the task time controller', () => {
  it('returns the created entry and its internal location', async () => {
    const execute = vi.fn().mockResolvedValue(entry);
    const controller = new TaskTimeController(
      { execute } as unknown as CreateTaskTimeEntry,
      {} as ListTaskTimeEntries,
      {} as GetTaskTimeEntry,
      {} as DeleteTaskTimeEntry,
      {} as GetTaskTimeSummary,
      {} as GetTaskStatusDurations,
    );
    const setHeader = vi.fn();
    const result = await asCamille(() =>
      controller.create({ taskKey: 'CAD-482' }, { minutes: 30, workDate: '2026-11-07' }, {
        setHeader,
      } as unknown as Response),
    );
    expect(execute).toHaveBeenCalledWith({
      organizationId,
      actorUserId,
      taskKey: 'CAD-482',
      minutes: 30,
      workDate: '2026-11-07',
      note: null,
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Location',
      `/internal/v1/tasks/CAD-482/time-entries/${id}`,
    );
    expect(CreateTaskTimeEntryInternalResponse.safeParse(result).success).toBe(true);
  });

  it('binds a page cursor to its task and tenant', async () => {
    const execute = vi.fn().mockResolvedValue({
      items: [entry],
      next: { id, createdAt: entry.createdAt },
      total: 2,
      totalMinutes: 60,
    });
    const controller = new TaskTimeController(
      {} as CreateTaskTimeEntry,
      { execute } as unknown as ListTaskTimeEntries,
      {} as GetTaskTimeEntry,
      {} as DeleteTaskTimeEntry,
      {} as GetTaskTimeSummary,
      {} as GetTaskStatusDurations,
    );
    const page = await asCamille(() => controller.list({ taskKey: 'CAD-482' }, { limit: 1 }));
    expect(ListTaskTimeEntriesInternalResponse.safeParse(page).success).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    await expect(
      asCamille(() =>
        controller.list({ taskKey: 'CAD-483' }, { limit: 1, cursor: page.nextCursor ?? undefined }),
      ),
    ).rejects.toMatchObject({ problem: { code: 'request.invalid' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('serializes the status observation and preserves a milestone null', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        summary: {
          observedAt: entry.createdAt,
          coverageStartedAt: entry.createdAt,
          complete: false,
          durations: [{ status: 'progress', durationMilliseconds: 0, active: true }],
        },
      })
      .mockResolvedValueOnce({ summary: null });
    const controller = new TaskTimeController(
      {} as CreateTaskTimeEntry,
      {} as ListTaskTimeEntries,
      {} as GetTaskTimeEntry,
      {} as DeleteTaskTimeEntry,
      {} as GetTaskTimeSummary,
      { execute } as unknown as GetTaskStatusDurations,
    );
    const result = await asCamille(() => controller.durations({ taskKey: 'CAD-482' }));
    expect(GetTaskStatusDurationsInternalResponse.safeParse(result).success).toBe(true);
    expect(result.summary?.observedAt).toBe('2026-11-07T09:30:00.000Z');
    expect(await asCamille(() => controller.durations({ taskKey: 'CAD-482' }))).toEqual({
      summary: null,
    });
  });
});
