import { GetListCountsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListCountsPath
 *
 * @description
 * Path of `GET /internal/v1/lists/{listId}/counts`: the id of the list, a UUID in either case, else
 * `400 request.invalid`.
 */
export class ListCountsPath extends zodDto(GetListCountsInternalParams) {}
