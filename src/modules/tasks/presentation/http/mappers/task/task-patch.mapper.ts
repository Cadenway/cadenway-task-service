import type { TaskChange } from '../../../../application/models/task/task-change.model.js';
import type { UpdateTaskBody } from '../../dto/input/task/update-task-body.dto.js';

/**
 * Function editsDescription
 *
 * @description
 * Whether a patch names `description` or `descriptionMentions`: either requires `If-Match`,
 * even when the text is null or the spans are empty.
 *
 * @param {UpdateTaskBody} body - The patch as sent.
 * @returns {boolean} `true` when the member is present.
 */
export function editsDescription(body: UpdateTaskBody): boolean {
  return body.description !== undefined || body.descriptionMentions !== undefined;
}

/**
 * Function toTaskChange
 *
 * @description
 * Maps the JSON Merge Patch of a task to the change of the use case, keeping a member left out
 * (absent) distinct from a member sent as `null`: `null` clears `description`, `cancelReason`,
 * `cancelNote`, `dueDate`, `startDate`, `estimateMinutes` and detaches a subtask (`parentKey`),
 * and the schema of the contract refuses it for `name`, `status`, `priority` and `listId`. The id
 * of the list is lower-cased, since the schema accepts a UUID in either case.
 *
 * @param {UpdateTaskBody} body - The patch as sent.
 * @returns {TaskChange} The change for the use case.
 */
export function toTaskChange(body: UpdateTaskBody): TaskChange {
  return {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.description === undefined ? {} : { description: body.description }),
    ...(body.descriptionMentions === undefined
      ? {}
      : {
          descriptionMentions: body.descriptionMentions.map((mention) => ({
            ...mention,
            userId: mention.userId.toLowerCase(),
          })),
        }),
    ...(body.status === undefined ? {} : { status: body.status }),
    ...(body.cancelReason === undefined ? {} : { cancelReason: body.cancelReason }),
    ...(body.cancelNote === undefined ? {} : { cancelNote: body.cancelNote }),
    ...(body.priority === undefined ? {} : { priority: body.priority }),
    ...(body.dueDate === undefined ? {} : { dueDate: body.dueDate }),
    ...(body.startDate === undefined ? {} : { startDate: body.startDate }),
    ...(body.estimateMinutes === undefined ? {} : { estimateMinutes: body.estimateMinutes }),
    ...(body.listId === undefined ? {} : { listId: body.listId.toLowerCase() }),
    ...(body.parentKey === undefined ? {} : { parentKey: body.parentKey }),
  };
}
