import { ListLabelsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class LabelsQuery
 *
 * @description
 * Query of `GET /internal/v1/labels`: the `search` text (1 to 100 characters), the opaque `cursor`
 * and the page size `limit`, 1 to 100 and 50 by default. An empty or longer search, an unknown
 * parameter and a text holding U+0000 answer `400 request.invalid`.
 */
export class LabelsQuery extends zodDto(
  ListLabelsInternalQueryParams.superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
