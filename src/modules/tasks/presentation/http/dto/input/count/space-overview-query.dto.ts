import { GetSpaceOverviewInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class SpaceOverviewQuery
 *
 * @description
 * Query of `GET /internal/v1/spaces/{spaceId}/overview`: the required `today`, the date of the
 * caller (`YYYY-MM-DD`), the opaque `cursor` and the page size `limit`, 1 to 100 and 50 by default.
 * A missing or malformed date, a date of the year 0000 and an unknown parameter answer
 * `400 request.invalid`.
 */
export class SpaceOverviewQuery extends zodDto(
  GetSpaceOverviewInternalQueryParams.superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
