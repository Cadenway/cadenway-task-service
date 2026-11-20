import { describe, expect, it } from 'vitest';

import type { ReportingPosition } from '../../models/reporting/reporting-position.model.js';
import { ReportingPage } from './reporting-page.service.js';

describe('ReportingPage', () => {
  it('orders accounts, numeric task keys and the unassigned bucket across pages', () => {
    const rows: ReportingPosition[] = [
      { userId: null, taskKey: 'CAD-1' },
      { userId: 'b', taskKey: 'CAD-2' },
      { userId: 'a', taskKey: 'CAD-10' },
      { userId: 'a', taskKey: 'CAD-2' },
    ];
    const pages = new ReportingPage();
    const first = pages.slice(rows, (row) => row, null, 2);
    expect(first.items).toEqual([rows[3], rows[2]]);
    expect(first.next).toEqual(rows[2]);
    expect(pages.slice(rows, (row) => row, first.next, 2)).toEqual({
      items: [rows[1], rows[0]],
      next: null,
    });
  });

  it('continues after a position whose row has since disappeared', () => {
    const rows: ReportingPosition[] = [
      { userId: 'a', taskKey: 'CAD-2' },
      { userId: 'a', taskKey: 'CAD-8' },
    ];
    expect(
      new ReportingPage().slice(rows, (row) => row, { userId: 'a', taskKey: 'CAD-5' }, 1),
    ).toEqual({ items: [rows[1]], next: null });
  });
});
