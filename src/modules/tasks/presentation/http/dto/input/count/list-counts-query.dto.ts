import { GetListCountsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class ListCountsQuery
 *
 * @description
 * Query of `GET /internal/v1/lists/{listId}/counts`: the required `today`, the date of the caller
 * (`YYYY-MM-DD`), which the late tasks are counted against. A missing or malformed date, a date of
 * the year 0000 and an unknown parameter answer `400 request.invalid`.
 */
export class ListCountsQuery extends zodDto(
  GetListCountsInternalQueryParams.superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
