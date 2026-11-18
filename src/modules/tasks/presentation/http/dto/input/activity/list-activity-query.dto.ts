import { ListListActivityInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class ListActivityQuery
 *
 * @description
 * Query of `GET /internal/v1/lists/{listId}/activity`: `kind` and `actorId`, the kinds and the
 * actors kept, the opaque `cursor` and the page size `limit`, 1 to 100 and 50 by default. The
 * contract writes `kind` and `actorId` as `style: form, explode: false` (`?kind=status,assign`)
 * while the generated schema expects arrays and the kit does not split them: the schema of the
 * contract is kept, with both members read from the comma-separated text or the repeated
 * parameter first. An unknown parameter, a kind that is not one of the five, an empty item and a
 * text holding U+0000 answer `400 request.invalid`.
 */
export class ListActivityQuery extends zodDto(
  ListListActivityInternalQueryParams.extend({
    kind: z.preprocess(splitCommaSeparated, ListListActivityInternalQueryParams.shape.kind),
    actorId: z.preprocess(splitCommaSeparated, ListListActivityInternalQueryParams.shape.actorId),
  }).superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
