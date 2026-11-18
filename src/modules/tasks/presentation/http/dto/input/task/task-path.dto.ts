import { GetTaskInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TaskPath
 *
 * @description
 * Path of the routes that name a task only, `/internal/v1/tasks/{taskKey}` and its `detail`,
 * `labels`, `subtasks`, `checklist-items` and `activity` sub-routes: the key of the task,
 * `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`, else `400 request.invalid`. A lower-case or zero-padded key is
 * refused. The generated path validators of these operations share this one shape.
 */
export class TaskPath extends zodDto(GetTaskInternalParams) {}
