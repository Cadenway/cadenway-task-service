import { describe, expect, it } from 'vitest';

import { DashboardQuery } from './dashboard-query.dto.js';
import { ExportQuery } from './export-query.dto.js';
import { TimesheetQuery } from './timesheet-query.dto.js';
import { WorkloadQuery } from './workload-query.dto.js';

describe('report query validation', () => {
  it('accepts comma-separated filters and rejects an incomplete work window', () => {
    expect(
      WorkloadQuery.schema.parse({ weekStart: '2026-11-16', status: 'todo,progress' }),
    ).toMatchObject({ status: ['todo', 'progress'], level: 'roots', limit: 50 });
    expect(WorkloadQuery.schema.safeParse({ weekStart: '2026-11-17' }).success).toBe(false);
    expect(TimesheetQuery.schema.safeParse({ weekStart: '9999-12-27' }).success).toBe(false);
  });

  it('checks zones, dashboard range and sheet sort pairs before running a query', () => {
    expect(
      DashboardQuery.schema.parse({ today: '2026-11-20', timeZone: 'Europe/Paris' }).weeks,
    ).toBe(8);
    expect(
      DashboardQuery.schema.safeParse({ today: '2026-11-20', timeZone: 'Mars/Olympus' }).success,
    ).toBe(false);
    expect(DashboardQuery.schema.safeParse({ today: '0001-01-01', timeZone: 'UTC' }).success).toBe(
      false,
    );
    expect(ExportQuery.schema.safeParse({ sheetSortDirection: 'asc' }).success).toBe(false);
  });
});
