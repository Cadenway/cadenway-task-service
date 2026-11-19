import { SetSpaceGrantInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceGrantPath
 *
 * @description
 * Path of `PUT` and `DELETE /internal/v1/spaces/{spaceId}/grants/{userId}`: two UUIDs, the space
 * and the person given access, else `400 request.invalid`.
 */
export class SpaceGrantPath extends zodDto(SetSpaceGrantInternalParams) {}
