import { AddTaskLabelInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class AddTaskLabelBody
 *
 * @description
 * Body of `POST /internal/v1/tasks/{taskKey}/labels/add` (`LabelChange`): a label made only of
 * spaces answers `400 request.invalid` with one issue on `name`, never echoing the value.
 */
export class AddTaskLabelBody extends zodDto(
  AddTaskLabelInternalBody.superRefine((body, context) => {
    refuseBlankName(context, ['name'], body.name, 'a label');
    refuseUnstorableValues(context, body);
  }),
) {}
