import { ExecuteBulkTaskActionInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** Validates the published bulk action and rejects repeated selections. */
export class BulkTaskActionBody extends zodDto(
  ExecuteBulkTaskActionInternalBody.superRefine((body, context) => {
    const keys = new Set<string>();
    body.selection.forEach((selected, index) => {
      if (keys.has(selected.taskKey)) {
        context.addIssue({
          code: 'custom',
          path: ['selection', index, 'taskKey'],
          message: 'Each task key must occur only once',
        });
      }
      keys.add(selected.taskKey);
    });
    refuseUnstorableValues(context, body);
  }),
) {}
