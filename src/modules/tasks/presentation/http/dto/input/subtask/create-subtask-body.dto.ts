import { CreateSubtaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import type { z } from 'zod';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Function checkSubtaskCreation
 *
 * @description
 * The checks of `SubtaskCreation` the generated schema cannot express: the name and each label
 * hold a character other than a space once trimmed, and no text holds U+0000 nor any date the year
 * 0000. Each failure is one issue on its member.
 *
 * @param {z.infer<typeof CreateSubtaskInternalBody>} body - The parsed body.
 * @param {z.RefinementCtx} context - Where the issues are added.
 */
function checkSubtaskCreation(
  body: z.infer<typeof CreateSubtaskInternalBody>,
  context: z.RefinementCtx,
): void {
  refuseBlankName(context, ['name'], body.name);
  body.labels.forEach((label: string, index: number): void => {
    refuseBlankName(context, ['labels', index], label, 'a label');
  });
  refuseUnstorableValues(context, body);
}

/**
 * Class CreateSubtaskBody
 *
 * @description
 * Body of `POST /internal/v1/tasks/{taskKey}/subtasks` (`SubtaskCreation`), validated with the
 * schema of the contract, which applies its defaults (`status` todo, `priority` moyenne, no label)
 * and `checkSubtaskCreation`. `assigneeIds` has no default, so that "absent", which takes the first
 * assignee of the parent, stays distinct from an empty list.
 */
export class CreateSubtaskBody extends zodDto(
  CreateSubtaskInternalBody.superRefine(checkSubtaskCreation),
) {}
