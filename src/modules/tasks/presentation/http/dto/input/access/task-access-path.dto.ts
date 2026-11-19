import { CheckTaskAccessInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TaskAccessPath
 *
 * @description
 * Path of `GET /internal/v1/tasks/{taskKey}/access`: the key of the task,
 * `^[A-Z]{2,5}-[1-9][0-9]{0,8}$`, else `400 request.invalid`, as on every route of a task.
 */
export class TaskAccessPath extends zodDto(CheckTaskAccessInternalParams) {}
