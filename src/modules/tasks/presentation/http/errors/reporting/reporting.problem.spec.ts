import { describe, expect, it } from 'vitest';

import { ReportingRefusal } from '../../../../application/models/reporting/reporting-refusal.model.js';
import { TaskRefusal } from '../../../../application/models/task/task-refusal.model.js';
import { answerReportingRefusals } from './reporting.problem.js';

describe('report refusals', () => {
  it('returns the documented limit and validation problems without exposing data', async () => {
    await expect(
      answerReportingRefusals(() =>
        Promise.reject(new ReportingRefusal('export-row-limit-reached')),
      ),
    ).rejects.toMatchObject({
      problem: { status: 422, code: 'list.export-row-limit-reached', details: { maxRows: 10000 } },
    });
    await expect(
      answerReportingRefusals(() => Promise.reject(new ReportingRefusal('sheet-column-invalid'))),
    ).rejects.toMatchObject({
      problem: {
        status: 400,
        code: 'request.invalid',
        details: { issues: [{ path: 'sheetSortColumn' }] },
      },
    });
  });

  it('retains the established missing-list refusal', async () => {
    await expect(
      answerReportingRefusals(() => Promise.reject(new TaskRefusal({ reason: 'list-not-found' }))),
    ).rejects.toMatchObject({ problem: { status: 404, code: 'list.not-found' } });
  });
});
