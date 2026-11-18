import { GetListInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListPath
 *
 * @description
 * Path of `GET` and `PATCH /internal/v1/lists/{listId}`: a UUID, else `400 request.invalid`.
 */
export class ListPath extends zodDto(GetListInternalParams) {}
