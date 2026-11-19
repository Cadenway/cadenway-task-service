import { SetListGrantInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListGrantPath
 *
 * @description
 * Path of `PUT` and `DELETE /internal/v1/lists/{listId}/grants/{userId}`: two UUIDs, the list and
 * the person given access, else `400 request.invalid`.
 */
export class ListGrantPath extends zodDto(SetListGrantInternalParams) {}
