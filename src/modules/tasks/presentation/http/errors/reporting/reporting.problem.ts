import { ProblemException } from '@cadenway/nest-common';

import { MAX_LIST_EXPORT_ROWS } from '../../../../application/models/reporting/reporting-export-rows.model.js';
import { ReportingRefusal } from '../../../../application/models/reporting/reporting-refusal.model.js';
import { answerRefusals } from '../task/task-refusal.problem.js';

/** Maps report-specific refusals and retains ordinary task refusal handling. */
export async function answerReportingRefusals<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await answerRefusals(work);
  } catch (error) {
    if (!(error instanceof ReportingRefusal)) throw error;
    if (error.reason === 'export-row-limit-reached') {
      throw new ProblemException({
        status: 422,
        code: 'list.export-row-limit-reached',
        details: { maxRows: MAX_LIST_EXPORT_ROWS },
      });
    }
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: {
        issues: [
          {
            in: 'query',
            path: 'sheetSortColumn',
            code: 'invalid_value',
            message: 'Expected an active field in this space.',
          },
        ],
      },
    });
  }
}
