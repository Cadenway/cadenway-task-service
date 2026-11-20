import { ListDependencyCandidatesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/** The direction, search and page of editable dependency candidates. */
export class ListDependencyCandidatesQuery extends zodDto(
  ListDependencyCandidatesInternalQueryParams.superRefine((query, context) => {
    refuseUnstorableValues(context, query);
  }),
) {}
