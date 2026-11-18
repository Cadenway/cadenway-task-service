import { ListListActivityInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListActivityPath
 *
 * @description
 * Path of `GET /internal/v1/lists/{listId}/activity`: the id of the list, a UUID in either case,
 * else `400 request.invalid`.
 */
export class ListActivityPath extends zodDto(ListListActivityInternalParams) {}
