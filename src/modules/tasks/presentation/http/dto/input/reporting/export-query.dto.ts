import { ExportListTasksInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** Task filters and optional sheet-only ordering for an export. */
export class ExportQuery extends zodDto(
  ExportListTasksInternalQueryParams.extend({
    status: z.preprocess(splitCommaSeparated, ExportListTasksInternalQueryParams.shape.status),
    priority: z.preprocess(splitCommaSeparated, ExportListTasksInternalQueryParams.shape.priority),
    assignee: z.preprocess(splitCommaSeparated, ExportListTasksInternalQueryParams.shape.assignee),
    label: z.preprocess(splitCommaSeparated, ExportListTasksInternalQueryParams.shape.label),
  })
    .strict()
    .superRefine((query, context) => {
      refuseUnstorableValues(context, query);
      if (query.sheetSortDirection !== undefined && query.sheetSortColumn === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['sheetSortDirection'],
          message: 'Requires a sheet sort column.',
        });
      }
    }),
) {}
