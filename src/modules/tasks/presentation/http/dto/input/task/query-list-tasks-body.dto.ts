import { QueryListTasksInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** Validates the JSON filters and pagination of the task collection. */
export class QueryListTasksBody extends zodDto(
  QueryListTasksInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
  }),
) {}
