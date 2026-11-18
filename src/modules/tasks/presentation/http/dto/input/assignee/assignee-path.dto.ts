import { AssignTaskInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class AssigneePath
 *
 * @description
 * Path of `PUT` and `DELETE /internal/v1/tasks/{taskKey}/assignees/{userId}`: the key of the task
 * and the account of the person, a UUID in either case, else `400 request.invalid`. The two
 * operations share this shape.
 */
export class AssigneePath extends zodDto(AssignTaskInternalParams) {}
