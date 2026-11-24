import { QueryListListActivityInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** Validates the JSON activity filters and pagination. */
export class QueryListActivityBody extends zodDto(
  QueryListListActivityInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
  }),
) {}
