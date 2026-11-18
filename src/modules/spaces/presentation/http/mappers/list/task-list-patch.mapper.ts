import type { UpdateListInput } from '../../../../application/use-cases/commands/list/update-list/update-list.input.js';
import type { UpdateListBody } from '../../dto/input/list/update-list-body.dto.js';

/**
 * Function toTaskListPatch
 *
 * @description
 * Maps the JSON Merge Patch of a list to the patch of the use case, keeping a member left out
 * (absent) distinct from a member sent as `null`: `null` clears `icon` and makes a sprint a list
 * again with `sprint`. A `goal` left out of a sprint stays absent: it is unchanged by a patch.
 *
 * @param {UpdateListBody} body - The patch as sent.
 * @returns {UpdateListInput['patch']} The patch for the use case.
 */
export function toTaskListPatch(body: UpdateListBody): UpdateListInput['patch'] {
  const sprint: UpdateListBody['sprint'] = body.sprint;
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.icon === undefined ? {} : { icon: body.icon }),
    ...(body.color === undefined ? {} : { color: body.color }),
    ...(sprint === undefined
      ? {}
      : {
          sprint:
            sprint === null
              ? null
              : {
                  startDate: sprint.startDate,
                  endDate: sprint.endDate,
                  ...(sprint.goal === undefined ? {} : { goal: sprint.goal }),
                },
        }),
  };
}
