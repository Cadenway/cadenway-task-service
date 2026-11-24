import { QueryExportListTasksInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** JSON task filters and optional sheet-only ordering for an export. */
export class ExportBody extends zodDto(
  QueryExportListTasksInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
    if (body.sheetSortDirection !== undefined && body.sheetSortColumn === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['sheetSortDirection'],
        message: 'Requires a sheet sort column.',
      });
    }
  }),
) {}
