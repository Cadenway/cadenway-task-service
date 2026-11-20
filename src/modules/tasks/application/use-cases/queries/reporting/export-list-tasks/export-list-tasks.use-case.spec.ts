import { describe, expect, it, vi } from 'vitest';

import type { ExportListTasksSink } from '../../../../models/reporting/export-list-tasks-sink.model.js';
import type { ReportingExportRow } from '../../../../models/reporting/reporting-export-row.model.js';
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
): {
  useCase: ExportListTasks;
  read: ReturnType<typeof vi.fn>;
  options: ReturnType<typeof vi.fn>;
} {
  const read = vi.fn().mockResolvedValue(data);
  const reader = { prepareExport: read } as unknown as ReportingReader;
  const options = vi.fn();
  const work: ReportingUnitOfWork = {
    async runReadOnly(fn, settings) {
      options(settings);
      return fn(reader);
    },
  };
  const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
  const spaces = {
    findVisibleList: vi.fn().mockResolvedValue(visible ? { space: { id: 'space' } } : null),
  } as unknown as SpaceDirectory;
  return { useCase: new ExportListTasks(work, members, spaces), read, options };
}

function sinkFixture(): {
  start: ReturnType<typeof vi.fn<ExportListTasksSink['start']>>;
  row: ReturnType<typeof vi.fn<ExportListTasksSink['row']>>;
} {
  return { start: vi.fn<ExportListTasksSink['start']>().mockReturnValue(true), row: vi.fn() };
}

const row: ReportingExportRow = {
  taskKey: 'CAD-1',
  name: 'a',
  status: 'todo',
  priority: 'haute',
  assignees: ['b', 'a'],
  dueDate: null,
  labels: [],
  customValues: {},
};

describe('ExportListTasks', () => {
  it('delivers escaped CSV fragments and account IDs in assignment order without retrying', async () => {
    const { useCase, read, options } = fixture({
      invalidSort: false,
      fields: [
        { id: 'a', name: '=Header' },
        { id: 'b', name: 'Points' },
      ],
      rowCount: 1,
      readPage: vi.fn().mockResolvedValue([
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
      ]),
    });
    const sink = sinkFixture();
    expect(await useCase.execute(input, sink)).toEqual({ rowCount: 1 });
    expect(sink.start).toHaveBeenCalledWith({
      filename: 'list-list.csv',
      header:
        '"Identifiant";"Nom";"Statut";"Priorité";"Assignés";"Échéance";"Étiquettes";"\'=Header";"Points"',
    });
    expect(sink.row).toHaveBeenCalledExactlyOnceWith({
      beforeAssignees: ['"CAD-1"', '"\'  =SUM(1)"', '"En cours"', '"Haute"'],
      assigneeIds: ['user-b', 'user-a'],
      afterAssignees: ['""', '"front"', '"\'+client"', '"-3"'],
    });
    expect(read).toHaveBeenCalledWith(
      'org',
      'list',
      'space',
      expect.anything(),
      input.order,
      null,
      10_001,
    );
    expect(options).toHaveBeenCalledExactlyOnceWith({ maxAttempts: 1 });
  });

  it('retains ordinary ordering for the gateway to sort by resolved people names', async () => {
    const { useCase, read } = fixture({
      invalidSort: false,
      fields: [],
      rowCount: 2,
      readPage: vi.fn().mockResolvedValue([row, { ...row, taskKey: 'CAD-2', assignees: [] }]),
    });
    const sink = sinkFixture();
    await useCase.execute({ ...input, sheetSort: { column: 'people', direction: 'desc' } }, sink);
    expect(read).toHaveBeenCalledWith(
      'org',
      'list',
      'space',
      expect.anything(),
      input.order,
      null,
      10_001,
    );
    expect(sink.row.mock.calls.map(([item]) => item.assigneeIds)).toEqual([['b', 'a'], []]);
  });

  it('refuses an over-limit selection before producing a projection', async () => {
    const readPage = vi.fn();
    const sink = sinkFixture();
    const { useCase } = fixture({
      invalidSort: false,
      fields: [],
      rowCount: 10_001,
      readPage,
    });
    await expect(useCase.execute(input, sink)).rejects.toMatchObject({
      reason: 'export-row-limit-reached',
    });
    expect(sink.start).not.toHaveBeenCalled();
    expect(readPage).not.toHaveBeenCalled();
  });

  it('does not read rows for an invisible list', async () => {
    const { useCase, read } = fixture({ invalidSort: true }, false);
    await expect(useCase.execute(input, sinkFixture())).rejects.toMatchObject({
      refusal: { reason: 'list-not-found' },
    });
    expect(read).not.toHaveBeenCalled();
  });

  it('does not read the next page until the current row is accepted by the consumer', async () => {
    const readPage = vi.fn().mockResolvedValue([row]);
    const { useCase } = fixture({ invalidSort: false, fields: [], rowCount: 2, readPage });
    const latch: { accept?: () => void } = {};
    const accepted = new Promise<void>((resolve) => {
      latch.accept = resolve;
    });
    const sink = sinkFixture();
    sink.row.mockReturnValueOnce(accepted);
    const exportResult = useCase.execute(input, sink);
    await vi.waitFor(() => {
      expect(sink.row).toHaveBeenCalledOnce();
    });
    expect(readPage).toHaveBeenCalledExactlyOnceWith(0);
    latch.accept?.();
    expect(await exportResult).toEqual({ rowCount: 2 });
    expect(readPage).toHaveBeenLastCalledWith(1);
  });

  it('stops the transaction on disconnect without reading the next page', async () => {
    const closed = new AbortController();
    const readPage = vi.fn().mockResolvedValue([row]);
    const { useCase } = fixture({ invalidSort: false, fields: [], rowCount: 2, readPage });
    const sink = sinkFixture();
    sink.row.mockImplementation(() => {
      closed.abort();
    });

    await expect(useCase.execute({ ...input, signal: closed.signal }, sink)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(readPage).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('does not load any rows when the consumer only asks for the metadata', async () => {
    const readPage = vi.fn();
    const { useCase } = fixture({ invalidSort: false, fields: [], rowCount: 2, readPage });
    const sink = sinkFixture();
    sink.start.mockReturnValue(false);
    expect(await useCase.execute(input, sink)).toEqual({ rowCount: 2 });
    expect(readPage).not.toHaveBeenCalled();
  });
});
