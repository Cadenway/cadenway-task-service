import { ListTasksInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class ListTasksQuery
 *
 * @description
 * Query of `GET /internal/v1/lists/{listId}/tasks`: the filters `status`, `priority`, `assignee`
 * (`me`, `none` or an account id), `label`, `search`, `dueFrom`, `dueTo` and `milestone`, the `level` (`roots`
 * by default), the `sort` (`manual` by default), the opaque `cursor` and the page size `limit`, 1 to
 * 100 and 50 by default. The contract writes the four lists as `style: form, explode: false`
 * (`?status=progress,review`) while the generated schema expects arrays and the kit does not split
 * them: the schema of the contract is kept, with the four members read from the comma-separated
 * text or the repeated parameter first (so a label cannot hold a comma). An unknown parameter, a
 * value outside its set, an empty item, a date of the year 0000 and a text holding U+0000 answer
 * `400 request.invalid`.
 */
export class ListTasksQuery extends zodDto(
  ListTasksInternalQueryParams.extend({
    status: z.preprocess(splitCommaSeparated, ListTasksInternalQueryParams.shape.status),
    priority: z.preprocess(splitCommaSeparated, ListTasksInternalQueryParams.shape.priority),
    assignee: z.preprocess(splitCommaSeparated, ListTasksInternalQueryParams.shape.assignee),
    label: z.preprocess(splitCommaSeparated, ListTasksInternalQueryParams.shape.label),
  }).superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
