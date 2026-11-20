import { GetTeamDashboardInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import {
  validateDashboardWindow,
  validateReportingZone,
} from '../../../validation/reporting/reporting-query.validator.js';

/** Observation date, calendar zone and selected dashboard window. */
export class DashboardQuery extends zodDto(
  GetTeamDashboardInternalQueryParams.strict().superRefine((query, context) => {
    validateReportingZone(query.timeZone, context);
    validateDashboardWindow(query.today, query.weeks, context);
  }),
) {}
