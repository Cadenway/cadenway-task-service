import { CountTaskGroupsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TaskGroupsPath
 *
 * @description
 * Path of `GET /internal/v1/lists/{listId}/task-groups`: the id of the list, a UUID in either case,
 * else `400 request.invalid`.
 */
export class TaskGroupsPath extends zodDto(CountTaskGroupsInternalParams) {}
