import { ListTaskActivityInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class TaskActivityQuery
 *
 * @description
 * Query of `GET /internal/v1/tasks/{taskKey}/activity`: `kind`, the kinds kept, the opaque
 * `cursor` and the page size `limit`, 1 to 100 and 50 by default. The contract writes `kind` as
 * `style: form, explode: false` (`?kind=status,assign`) while the generated schema expects an
 * array and the kit does not split it: the schema of the contract is kept, with `kind` read from
 * the comma-separated text or the repeated parameter first. An unknown parameter, a kind that is
 * not one of the five and an empty item answer `400 request.invalid`.
 */
export class TaskActivityQuery extends zodDto(
  ListTaskActivityInternalQueryParams.extend({
    kind: z.preprocess(splitCommaSeparated, ListTaskActivityInternalQueryParams.shape.kind),
  }).superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
