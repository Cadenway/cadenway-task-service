import { QueryCountTaskGroupsInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** Validates the JSON grouping, filters and pagination. */
export class QueryTaskGroupsBody extends zodDto(
  QueryCountTaskGroupsInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
  }),
) {}
