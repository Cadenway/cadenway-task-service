import { UpdateListInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class UpdateListBody
 *
 * @description
 * Body of `PATCH /internal/v1/lists/{listId}`, a JSON Merge Patch (`ListPatch`), validated with the
 * schema of the contract and a check of the name: a name made only of spaces answers
 * `400 request.invalid` with one issue on `name`, never echoing the value. A member left out stays
 * absent, which is not `null`: `null` clears `icon` and, for `sprint`, makes a sprint a list
 * again. Members the contract does not declare are dropped.
 */
export class UpdateListBody extends zodDto(
  UpdateListInternalBody.superRefine((body, context) => {
    refuseBlankName(context, ['name'], body.name);
    refuseUnstorableValues(context, body);
  }),
) {}
