import { encodeCursor } from '@cadenway/nest-common';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import type { SprintReportSnapshot } from '../../../../application/models/reporting/sprint-report-snapshot.model.js';
import { sprintReportCursor, sprintReportPosition } from './sprint-report-cursor.mapper.js';

const scope = {
  organizationId: 'org-a',
  actorUserId: 'user-a',
  listId: 'list-a',
  today: '2026-11-20',
  timeZone: 'Europe/Paris',
};
const schedule = {
  name: Array.from({ length: 80 }, (_, index) => String.fromCodePoint(0x10000 + index * 751)).join(
    '',
  ),
  startDate: '2026-11-10',
  endDate: '2026-11-25',
};

describe('the sprint report cursor', () => {
  it('round trips a large observation and binds it to the caller', () => {
    const running = Array.from({ length: 450 }, (_, index) => 1000 + index * 8 + (index % 7)).join(
      ',',
    );
    const snapshot = `999:5000:${running}` as SprintReportSnapshot;
    const position = {
      date: '2026-11-17',
      serverObservedAt: new Date('2026-11-20T12:00:00.000Z'),
      snapshot,
      schedule,
    };
    const cursor = sprintReportCursor(position, scope);
    expect(cursor).not.toBeNull();
    expect(cursor?.length).toBeLessThanOrEqual(2048);
    expect(sprintReportPosition(cursor ?? undefined, scope)).toEqual(position);
    expect(() =>
      sprintReportPosition(cursor ?? undefined, { ...scope, actorUserId: 'user-b' }),
    ).toThrow();
  });

  it('rejects malformed compressed content and impossible snapshot ranges', () => {
    const cursor = encodeCursor(
      { id: '2026-11-17', sort: ['2026-11-20T12:00:00.000Z', 'bad'] },
      scope,
    );
    expect(() => sprintReportPosition(cursor, scope)).toThrow();
    expect(() =>
      sprintReportCursor(
        {
          date: '2026-11-17',
          serverObservedAt: new Date('2026-11-20T12:00:00.000Z'),
          snapshot: '5:4:' as SprintReportSnapshot,
          schedule,
        },
        scope,
      ),
    ).toThrow();
  });

  it('rejects an observation whose date is outside the saved sprint page range', () => {
    const compressed = deflateRawSync(
      JSON.stringify(['20:24:21,23', 'Sprint 14', schedule.startDate, schedule.endDate]),
    ).toString('base64url');
    const cursor = encodeCursor(
      { id: schedule.endDate, sort: ['2026-11-20T12:00:00.000Z', compressed] },
      scope,
    );
    expect(() => sprintReportPosition(cursor, scope)).toThrow();
  });
});
