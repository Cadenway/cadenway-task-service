import { ListListGrantsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListGrantsPath
 *
 * @description
 * Path of `GET /internal/v1/lists/{listId}/grants`: a UUID, else `400 request.invalid`.
 */
export class ListGrantsPath extends zodDto(ListListGrantsInternalParams) {}
