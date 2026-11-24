import { QueryGetListWorkloadInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';
import { validateReportingWeek } from '../../../validation/reporting/reporting-query.validator.js';

/** JSON filters and pagination for a two-week workload. */
export class WorkloadBody extends zodDto(
  QueryGetListWorkloadInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
    validateReportingWeek(body.weekStart, 14, context);
  }),
) {}
