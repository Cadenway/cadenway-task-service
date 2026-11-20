import { GetSprintReportInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { validateReportingZone } from '../../../validation/reporting/reporting-query.validator.js';

/** Calendar observation and pagination for a sprint report. */
export class SprintReportQuery extends zodDto(
  GetSprintReportInternalQueryParams.strict().superRefine((query, context) => {
    validateReportingZone(query.timeZone, context);
  }),
) {}
