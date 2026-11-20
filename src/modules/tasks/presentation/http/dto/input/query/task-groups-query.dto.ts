import { CountTaskGroupsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { z } from 'zod';

import { splitCommaSeparated } from '../../../validation/query/comma-separated.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class TaskGroupsQuery
 *
 * @description
 * Query of `GET /internal/v1/lists/{listId}/task-groups`: the required `groupBy` (`status`,
 * `priority` or `assignee`), the filters of the tasks of the list including `milestone` and
 * without the `sort`, the opaque
 * `cursor` and the page size `limit`, 1 to 100 and 50 by default. The four lists are read from the
 * comma-separated text or the repeated parameter first, as for the tasks of a list. A missing or
 * unknown `groupBy`, an unknown parameter, an empty item, a date of the year 0000 and a text
 * holding U+0000 answer `400 request.invalid`.
 */
export class TaskGroupsQuery extends zodDto(
  CountTaskGroupsInternalQueryParams.extend({
    status: z.preprocess(splitCommaSeparated, CountTaskGroupsInternalQueryParams.shape.status),
    priority: z.preprocess(splitCommaSeparated, CountTaskGroupsInternalQueryParams.shape.priority),
    assignee: z.preprocess(splitCommaSeparated, CountTaskGroupsInternalQueryParams.shape.assignee),
    label: z.preprocess(splitCommaSeparated, CountTaskGroupsInternalQueryParams.shape.label),
  }).superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
