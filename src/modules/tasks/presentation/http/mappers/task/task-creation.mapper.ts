import type { Caller } from '../../../../application/models/caller/caller.model.js';
import type { CreateSubtaskInput } from '../../../../application/use-cases/commands/subtask/create-subtask/create-subtask.input.js';
import type { CreateTaskInput } from '../../../../application/use-cases/commands/task/create-task/create-task.input.js';
import type { CreateSubtaskBody } from '../../dto/input/subtask/create-subtask-body.dto.js';
import type { CreateTaskBody } from '../../dto/input/task/create-task-body.dto.js';

/**
 * Function toCreateTaskInput
 *
 * @description
 * Maps the body of a task creation to the input of the use case: the members the contract lets
 * out or sends as `null` become `null`. A milestone's omitted start stays absent so the domain
 * can align it with the due date. The accounts to assign are lower-cased and each subtask is
 * reduced to its name.
 *
 * @param {Caller} caller - The organization and the user of the verified token.
 * @param {string} listId - The list of the path.
 * @param {CreateTaskBody} body - The body, with the defaults of the contract applied.
 * @returns {CreateTaskInput} The input of the use case.
 */
export function toCreateTaskInput(
  caller: Caller,
  listId: string,
  body: CreateTaskBody,
): CreateTaskInput {
  return {
    ...caller,
    listId: listId.toLowerCase(),
    name: body.name,
    description: body.description ?? null,
    ...(body.descriptionMentions === undefined
      ? {}
      : {
          descriptionMentions: body.descriptionMentions.map((span) => ({
            ...span,
            userId: span.userId.toLowerCase(),
          })),
        }),
    status: body.status,
    cancelReason: body.cancelReason ?? null,
    cancelNote: body.cancelNote ?? null,
    priority: body.priority,
    assigneeIds: body.assigneeIds.map((userId: string): string => userId.toLowerCase()),
    dueDate: body.dueDate ?? null,
    ...(body.milestone === true && body.startDate === undefined
      ? {}
      : { startDate: body.startDate ?? null }),
    estimateMinutes: body.estimateMinutes ?? null,
    ...(body.milestone === undefined ? {} : { milestone: body.milestone }),
    ...(body.recurrence === undefined ? {} : { recurrence: body.recurrence }),
    labels: body.labels,
    subtaskNames: body.subtasks.map((subtask: { name: string }): string => subtask.name),
    checklistTexts: body.checklist?.map(({ text }): string => text) ?? [],
  };
}

/**
 * Function toCreateSubtaskInput
 *
 * @description
 * Maps the body of a subtask creation to the input of the use case. `assigneeIds` stays `null`
 * when the body leaves it out, so that the subtask takes the first assignee of its parent, and
 * stays a list, possibly empty, when the body gives one. The accounts are lower-cased.
 *
 * @param {Caller} caller - The organization and the user of the verified token.
 * @param {string} taskKey - The key of the parent, from the path.
 * @param {CreateSubtaskBody} body - The body, with the defaults of the contract applied.
 * @returns {CreateSubtaskInput} The input of the use case.
 */
export function toCreateSubtaskInput(
  caller: Caller,
  taskKey: string,
  body: CreateSubtaskBody,
): CreateSubtaskInput {
  return {
    ...caller,
    taskKey,
    name: body.name,
    description: body.description ?? null,
    status: body.status,
    cancelReason: body.cancelReason ?? null,
    cancelNote: body.cancelNote ?? null,
    priority: body.priority,
    assigneeIds:
      body.assigneeIds === undefined
        ? null
        : body.assigneeIds.map((userId: string): string => userId.toLowerCase()),
    dueDate: body.dueDate ?? null,
    startDate: body.startDate ?? null,
    estimateMinutes: body.estimateMinutes ?? null,
    labels: body.labels,
  };
}
