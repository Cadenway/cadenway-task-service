import { GetListWorkloadInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';
import { validateReportingWeek } from '../../../validation/reporting/reporting-query.validator.js';

/** Filters and pagination for a two-week workload. */
export class WorkloadQuery extends zodDto(
  GetListWorkloadInternalQueryParams.extend({
    status: z.preprocess(splitCommaSeparated, GetListWorkloadInternalQueryParams.shape.status),
    priority: z.preprocess(splitCommaSeparated, GetListWorkloadInternalQueryParams.shape.priority),
    assignee: z.preprocess(splitCommaSeparated, GetListWorkloadInternalQueryParams.shape.assignee),
    label: z.preprocess(splitCommaSeparated, GetListWorkloadInternalQueryParams.shape.label),
  })
    .strict()
    .superRefine((query, context) => {
      refuseUnstorableValues(context, query);
      validateReportingWeek(query.weekStart, 14, context);
    }),
) {}
