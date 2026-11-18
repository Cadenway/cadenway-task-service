import { GetHomeInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class HomeQuery
 *
 * @description
 * Query of `GET /internal/v1/users/{userId}/home`: the required `today`, the date of the caller
 * (`YYYY-MM-DD`), which the late tasks, the tasks due that day and the current sprints are counted
 * against. A missing or malformed date, a date of the year 0000 and an unknown parameter answer
 * `400 request.invalid`.
 */
export class HomeQuery extends zodDto(
  GetHomeInternalQueryParams.superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
