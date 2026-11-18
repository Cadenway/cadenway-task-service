import type { TaskChange } from '../../../../application/models/task/task-change.model.js';
import type { UpdateTaskBody } from '../../dto/input/task/update-task-body.dto.js';

/**
 * Function editsDescription
 *
 * @description
 * Whether a patch names `description`, even as `null` or with the value the task already has: the
 * one member that edits a long text, for which `If-Match` is required.
 *
 * @param {UpdateTaskBody} body - The patch as sent.
 * @returns {boolean} `true` when the member is present.
 */
export function editsDescription(body: UpdateTaskBody): boolean {
  return body.description !== undefined;
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
