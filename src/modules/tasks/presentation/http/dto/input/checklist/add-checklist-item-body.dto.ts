import { AddChecklistItemInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class AddChecklistItemBody
 *
 * @description
 * Body of `POST /internal/v1/tasks/{taskKey}/checklist-items` (`ChecklistItemCreation`): a text
 * made only of spaces answers `400 request.invalid` with one issue on `text`, never echoing the
 * value.
 */
export class AddChecklistItemBody extends zodDto(
  AddChecklistItemInternalBody.superRefine((body, context) => {
    refuseBlankName(context, ['text'], body.text, 'a text');
    refuseUnstorableValues(context, body);
  }),
) {}
