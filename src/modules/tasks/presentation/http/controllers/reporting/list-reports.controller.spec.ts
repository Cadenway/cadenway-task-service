import { runWithOrganizationContext } from '@cadenway/nest-common';
import { describe, expect, it, vi } from 'vitest';

import type { ExportListTasks } from '../../../../application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.use-case.js';
import type { GetListTimesheet } from '../../../../application/use-cases/queries/reporting/get-list-timesheet/get-list-timesheet.use-case.js';
import type { GetListWorkload } from '../../../../application/use-cases/queries/reporting/get-list-workload/get-list-workload.use-case.js';
import type { GetSprintReport } from '../../../../application/use-cases/queries/reporting/get-sprint-report/get-sprint-report.use-case.js';
import { ListReportsController } from './list-reports.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: actorUserId }, role: null, scopes: [] },
    work,
  );
}

describe('list reporting routes', () => {
  it('maps the workload rows and binds the next cursor to the actor and filters', async () => {
    const days = Array.from({ length: 14 }, (_, index) => ({
      date: new Date(Date.parse('2026-11-16T00:00:00Z') + index * 86_400_000)
        .toISOString()
        .slice(0, 10),
      totalMinutes: 0,
      dailyCapacityMinutes: index % 7 < 5 ? 360 : 0,
    }));
    const execute = vi.fn().mockResolvedValue({
      listId,
      weekStart: '2026-11-16',
      days,
      totalMinutes: 0,
      items: [],
      next: { taskKey: 'CAD-482', userId: actorUserId },
    });
    const controller = new ListReportsController(
      { execute } as unknown as GetListWorkload,
      {} as GetListTimesheet,
      {} as GetSprintReport,
      {} as ExportListTasks,
    );
    const query = { weekStart: '2026-11-16', level: 'roots' as const, limit: 1 };
    const response = await asMember(() => controller.workload({ listId }, query));
    expect(response.nextCursor).not.toBeNull();
    await expect(
      asMember(() =>
        controller.workload(
          { listId },
          { ...query, weekStart: '2026-11-23', cursor: response.nextCursor ?? undefined },
        ),
      ),
    ).rejects.toMatchObject({ problem: { status: 400, code: 'request.invalid' } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns structured export cells after validating the result against the installed contract', async () => {
    const execute = vi.fn().mockResolvedValue({
      filename: 'list.csv',
      header: '"Identifiant";"Nom";"Statut";"Priorité";"Assignés";"Échéance";"Étiquettes"',
      rows: [
        {
          beforeAssignees: ['"CAD-482"', '"Task"', '"À faire"', '"Haute"'],
          assigneeIds: [],
          afterAssignees: ['""', '""'],
        },
      ],
    });
    const controller = new ListReportsController(
      {} as GetListWorkload,
      {} as GetListTimesheet,
      {} as GetSprintReport,
      { execute } as unknown as ExportListTasks,
    );
    const response = await asMember(() =>
      controller.export({ listId }, { level: 'roots', sort: 'manual' }),
    );
    expect(response.rows[0]?.assigneeIds).toEqual([]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, actorUserId, listId, sheetSort: null }),
    );
  });
});
