import { ListSpaceGrantsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceGrantsPath
 *
 * @description
 * Path of `GET /internal/v1/spaces/{spaceId}/grants`: a UUID, else `400 request.invalid`.
 */
export class SpaceGrantsPath extends zodDto(ListSpaceGrantsInternalParams) {}
