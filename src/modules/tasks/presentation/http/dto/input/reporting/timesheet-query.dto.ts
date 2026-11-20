import { GetListTimesheetInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { validateReportingWeek } from '../../../validation/reporting/reporting-query.validator.js';

/** Pagination and Monday of a timesheet. */
export class TimesheetQuery extends zodDto(
  GetListTimesheetInternalQueryParams.strict().superRefine((query, context) => {
    validateReportingWeek(query.weekStart, 7, context);
  }),
) {}
