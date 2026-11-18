import { CreateTaskInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListTasksPath
 *
 * @description
 * Path of `POST` and `GET /internal/v1/lists/{listId}/tasks`: the id of the list, a UUID in either case, else
 * `400 request.invalid`.
 */
export class ListTasksPath extends zodDto(CreateTaskInternalParams) {}
