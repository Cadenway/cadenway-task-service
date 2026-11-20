import { UpdateTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';
import { refuseMalformedCustomFieldText } from '../../../validation/custom-field/custom-field-text.validator.js';

/**
 * Class UpdateTaskBody
 *
 * @description
 * Body of `PATCH /internal/v1/tasks/{taskKey}`, a JSON Merge Patch (`TaskPatch`), validated with
 * the schema of the contract and a check of the name: a name made only of spaces answers
 * `400 request.invalid` with one issue on `name`, never echoing the value. A member left out stays
 * absent, which is not `null`: `null` clears `description`, `cancelReason`, `cancelNote`,
 * `dueDate`, `startDate`, `estimateMinutes` and, for `parentKey`, detaches a subtask. The members
 * the contract does not declare, `assigneeIds` and `labels` included, are dropped.
 */
export class UpdateTaskBody extends zodDto(
  UpdateTaskInternalBody.superRefine((body, context) => {
    refuseBlankName(context, ['name'], body.name);
    refuseUnstorableValues(context, body);
    for (const [fieldId, value] of Object.entries(body.customFieldValues ?? {})) {
      if (typeof value === 'string') {
        refuseMalformedCustomFieldText(context, value, ['customFieldValues', fieldId]);
      }
    }
  }),
) {}
