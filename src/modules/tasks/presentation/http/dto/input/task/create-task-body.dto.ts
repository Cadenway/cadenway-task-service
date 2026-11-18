import { CreateTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import type { z } from 'zod';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Function checkTaskCreation
 *
 * @description
 * The checks of `TaskCreation` the generated schema cannot express: the name of the task, the name
 * of each subtask and each label hold a character other than a space once trimmed, and no text
 * holds U+0000 nor any date the year 0000. Each failure is one issue on its member.
 *
 * @param {z.infer<typeof CreateTaskInternalBody>} body - The parsed body.
 * @param {z.RefinementCtx} context - Where the issues are added.
 */
function checkTaskCreation(
  body: z.infer<typeof CreateTaskInternalBody>,
  context: z.RefinementCtx,
): void {
  refuseBlankName(context, ['name'], body.name);
  body.subtasks.forEach((subtask: { name: string }, index: number): void => {
    refuseBlankName(context, ['subtasks', index, 'name'], subtask.name);
  });
  body.labels.forEach((label: string, index: number): void => {
    refuseBlankName(context, ['labels', index], label, 'a label');
  });
  refuseUnstorableValues(context, body);
}

/**
 * Class CreateTaskBody
 *
 * @description
 * Body of `POST /internal/v1/lists/{listId}/tasks` (`TaskCreation`), validated with the schema of
 * the contract, which applies its defaults (`status` todo, `priority` moyenne, no assignee, no
 * label, no subtask), and `checkTaskCreation`: `400 request.invalid` with one issue per refused
 * member, never echoing a value. Members the contract does not declare are dropped.
 */
export class CreateTaskBody extends zodDto(CreateTaskInternalBody.superRefine(checkTaskCreation)) {}
