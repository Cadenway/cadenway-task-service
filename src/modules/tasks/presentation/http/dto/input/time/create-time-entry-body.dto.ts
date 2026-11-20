import { CreateTaskTimeEntryInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** The published creation body, checked for text PostgreSQL cannot store. */
export class CreateTimeEntryBody extends zodDto(
  CreateTaskTimeEntryInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
    if (body.note !== undefined && /\p{Surrogate}/u.test(body.note)) {
      context.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Expected well-formed Unicode text',
      });
    }
  }),
) {}
