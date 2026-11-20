import { runWithOrganizationContext } from '@cadenway/nest-common';
import type { Response } from 'express';
import { Buffer } from 'node:buffer';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import type { ExportListTasks } from '../../../../application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.use-case.js';
import type { GetListTimesheet } from '../../../../application/use-cases/queries/reporting/get-list-timesheet/get-list-timesheet.use-case.js';
import type { GetListWorkload } from '../../../../application/use-cases/queries/reporting/get-list-workload/get-list-workload.use-case.js';
import type { GetSprintReport } from '../../../../application/use-cases/queries/reporting/get-sprint-report/get-sprint-report.use-case.js';
import { ListReportsController } from './list-reports.controller.js';

const organizationId = '019a7000-1a2b-7c3d-8e4f-5a6b7c8d9e01';
const actorUserId = '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b30';
const listId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';

const metadata = {
  filename: 'list.csv',
  header: '"Identifiant";"Nom";"Statut";"Priorité";"Assignés";"Échéance";"Étiquettes"',
};
const row = {
  beforeAssignees: ['"CAD-482"', '"Task"', '"À faire"', '"Haute"'],
  assigneeIds: [],
  afterAssignees: ['""', '""'],
};

function asMember<T>(work: () => Promise<T>): Promise<T> {
  return runWithOrganizationContext(
    { organizationId, actor: { type: 'user', id: actorUserId }, role: null, scopes: [] },
    work,
  );
}

function responseFixture(method = 'GET', accept?: string) {
  const response = Object.assign(new EventEmitter(), {
    req: { method, headers: { accept }, accepts: vi.fn().mockReturnValue('application/x-ndjson') },
    headersSent: false,
    destroyed: false,
    status: vi.fn(),
    type: vi.fn().mockReturnThis(),
    vary: vi.fn().mockReturnThis(),
    end: vi.fn(),
    destroy: vi.fn(),
    write: vi.fn<(chunk: Buffer) => boolean>(),
  });
  response.status.mockReturnValue(response);
  response.write.mockImplementation(() => {
    response.headersSent = true;
    return true;
  });
  return Object.assign(response, { http: response as unknown as Response });
}

function exportController(execute: ExportListTasks['execute']): ListReportsController {
  return new ListReportsController(
    {} as GetListWorkload,
    {} as GetListTimesheet,
    {} as GetSprintReport,
    { execute } as ExportListTasks,
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

  it('writes the same contracted JSON incrementally and completes only after the snapshot', async () => {
    const response = responseFixture();
    const execute = vi.fn<ExportListTasks['execute']>(async (_input, sink) => {
      expect(response.write).not.toHaveBeenCalled();
      if (await sink.start(metadata)) {
        await sink.row(row);
        await sink.row(row);
      }
      expect(response.end).not.toHaveBeenCalled();
      return { rowCount: 2 };
    });
    await asMember(() =>
      exportController(execute).export(
        { listId },
        { level: 'roots', sort: 'manual' },
        response.http,
      ),
    );
    expect(response.type).toHaveBeenCalledExactlyOnceWith('application/json; charset=utf-8');
    expect(response.vary).toHaveBeenCalledExactlyOnceWith('Accept');
    expect(response.write).toHaveBeenCalledTimes(3);
    expect(response.end).toHaveBeenCalledExactlyOnceWith(']}');
    const chunks = Buffer.concat([...response.write.mock.calls.flat(), Buffer.from(']}')]).toString(
      'utf8',
    );
    expect(JSON.parse(chunks)).toEqual({ ...metadata, rows: [row, row] });
    const [actualInput] = execute.mock.calls[0] ?? [];
    expect(actualInput).toMatchObject({ organizationId, actorUserId, listId, sheetSort: null });
    expect(actualInput?.signal).toBeInstanceOf(AbortSignal);
  });

  it('writes newline-terminated NDJSON and sends its counted trailer after the snapshot', async () => {
    const response = responseFixture('GET', 'application/x-ndjson');
    const controller = exportController(async (_input, sink) => {
      await sink.start(metadata);
      await sink.row(row);
      expect(response.write).toHaveBeenCalledTimes(2);
      expect(response.end).not.toHaveBeenCalled();
      return { rowCount: 1 };
    });
    await asMember(() =>
      controller.export({ listId }, { level: 'roots', sort: 'manual' }, response.http),
    );
    expect(response.type).toHaveBeenCalledExactlyOnceWith('application/x-ndjson; charset=utf-8');
    expect(response.vary).toHaveBeenCalledExactlyOnceWith('Accept');
    const buffers = response.write.mock.calls.flat();
    expect(buffers.every((chunk) => Buffer.isBuffer(chunk))).toBe(true);
    const chunks = buffers.map((chunk) => chunk.toString('utf8'));
    expect(chunks.every((chunk) => chunk.endsWith('\n'))).toBe(true);
    expect(chunks.map((chunk): unknown => JSON.parse(chunk))).toEqual([
      { kind: 'metadata', ...metadata },
      { kind: 'row', row },
      { kind: 'complete', rowCount: 1 },
    ]);
    expect(response.end).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('closes the stream without writing a record above the NDJSON UTF-8 byte limit', async () => {
    const response = responseFixture('GET', 'application/x-ndjson');
    const controller = exportController(async (_input, sink) => {
      await sink.start(metadata);
      await sink.row({ ...row, afterAssignees: ['""', 'é'.repeat(65_536)] });
      return { rowCount: 1 };
    });
    await expect(
      asMember(() =>
        controller.export({ listId }, { level: 'roots', sort: 'manual' }, response.http),
      ),
    ).rejects.toThrow('The export record exceeds its byte limit.');
    expect(response.write).toHaveBeenCalledOnce();
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('does not complete or send an error document after the snapshot fails midstream', async () => {
    const response = responseFixture();
    const controller = exportController(async (_input, sink) => {
      await sink.start(metadata);
      await sink.row(row);
      throw new Error('Snapshot failed.');
    });
    await expect(
      asMember(() =>
        controller.export({ listId }, { level: 'roots', sort: 'manual' }, response.http),
      ),
    ).rejects.toThrow('Snapshot failed.');
    expect(response.destroy).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
  });

  it('stops waiting for drain and detaches its listeners when the consumer disconnects', async () => {
    const response = responseFixture();
    response.write.mockReturnValue(false);
    const controller = exportController(async (_input, sink) => {
      await sink.start(metadata);
      await sink.row(row);
      return { rowCount: 1 };
    });
    const delivery = asMember(() =>
      controller.export({ listId }, { level: 'roots', sort: 'manual' }, response.http),
    );
    await vi.waitFor(() => {
      expect(response.write).toHaveBeenCalledOnce();
    });
    response.destroyed = true;
    response.emit('close');
    await delivery;
    expect(response.write).toHaveBeenCalledOnce();
    expect(response.end).not.toHaveBeenCalled();
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('drain')).toBe(0);
  });

  it('answers HEAD with headers and no JSON body', async () => {
    const response = responseFixture('HEAD');
    const controller = exportController(async (_input, sink) => {
      expect(await sink.start(metadata)).toBe(false);
      return { rowCount: 3 };
    });
    await asMember(() =>
      controller.export({ listId }, { level: 'roots', sort: 'manual' }, response.http),
    );
    expect(response.type).toHaveBeenCalled();
    expect(response.write).not.toHaveBeenCalled();
    expect(response.end).toHaveBeenCalledOnce();
  });
});
