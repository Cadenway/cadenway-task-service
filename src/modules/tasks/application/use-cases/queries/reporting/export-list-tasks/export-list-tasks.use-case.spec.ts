import { describe, expect, it, vi } from 'vitest';

import type { ReportingExportRows } from '../../../../models/reporting/reporting-export-rows.model.js';
import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import type { ExportListTasksInput } from './export-list-tasks.input.js';
import { ExportListTasks } from './export-list-tasks.use-case.js';

const input: ExportListTasksInput = {
  organizationId: 'org',
  actorUserId: 'user',
  listId: 'list',
  filter: {
    statuses: null,
    priorities: null,
    assignees: null,
    labels: null,
    search: null,
    dueFrom: null,
    dueTo: null,
    level: 'all',
  },
  order: { key: 'manual', descending: false },
  sheetSort: null,
};

function fixture(
  data: ReportingExportRows,
  visible = true,
): { useCase: ExportListTasks; read: ReturnType<typeof vi.fn> } {
  const read = vi.fn().mockResolvedValue(data);
  const reader = { exportRows: read } as unknown as ReportingReader;
  const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
  const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
  const spaces = {
    findVisibleList: vi.fn().mockResolvedValue(visible ? { space: { id: 'space' } } : null),
  } as unknown as SpaceDirectory;
  return { useCase: new ExportListTasks(work, members, spaces), read };
}

describe('ExportListTasks', () => {
  it('returns escaped CSV fragments and account IDs in assignment order', async () => {
    const { useCase, read } = fixture({
      invalidSort: false,
      fields: [
        { id: 'a', name: '=Header' },
        { id: 'b', name: 'Points' },
      ],
      rows: [
        {
          taskKey: 'CAD-1',
          name: '  =SUM(1)',
          status: 'progress',
          priority: 'haute',
          assignees: ['user-b', 'user-a'],
          dueDate: null,
          labels: ['front'],
          customValues: { a: '+client', b: -3 },
        },
      ],
    });
    const result = await useCase.execute(input);
    expect(result.filename).toBe('list-list.csv');
    expect(result.header).toBe(
      '"Identifiant";"Nom";"Statut";"Priorité";"Assignés";"Échéance";"Étiquettes";"\'=Header";"Points"',
    );
    expect(result.rows).toEqual([
      {
        beforeAssignees: ['"CAD-1"', '"\'  =SUM(1)"', '"En cours"', '"Haute"'],
        assigneeIds: ['user-b', 'user-a'],
        afterAssignees: ['""', '"front"', '"\'+client"', '"-3"'],
      },
    ]);
    expect(read).toHaveBeenCalledWith('org', 'list', 'space', expect.anything(), input.order, null);
  });

  it('retains ordinary ordering for the gateway to sort by resolved people names', async () => {
    const row = {
      taskKey: 'CAD-1',
      name: 'a',
      status: 'todo' as const,
      priority: 'haute' as const,
      assignees: ['b', 'a'],
      dueDate: null,
      labels: [],
      customValues: {},
    };
    const { useCase, read } = fixture({
      invalidSort: false,
      fields: [],
      rows: [row, { ...row, taskKey: 'CAD-2', assignees: [] }],
    });
    const result = await useCase.execute({
      ...input,
      sheetSort: { column: 'people', direction: 'desc' },
    });
    expect(read).toHaveBeenCalledWith('org', 'list', 'space', expect.anything(), input.order, null);
    expect(result.rows.map((item) => item.assigneeIds)).toEqual([['b', 'a'], []]);
  });

  it('refuses an over-limit selection before producing a projection', async () => {
    const row = {
      taskKey: 'CAD-1',
      name: 'a',
      status: 'todo' as const,
      priority: 'haute' as const,
      assignees: [],
      dueDate: null,
      labels: [],
      customValues: {},
    };
    const { useCase } = fixture({
      invalidSort: false,
      fields: [],
      rows: Array.from({ length: 10001 }, () => row),
    });
    await expect(useCase.execute(input)).rejects.toMatchObject({
      reason: 'export-row-limit-reached',
    });
  });

  it('does not read rows for an invisible list', async () => {
    const { useCase, read } = fixture({ invalidSort: false, fields: [], rows: [] }, false);
    await expect(useCase.execute(input)).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(read).not.toHaveBeenCalled();
  });
});
