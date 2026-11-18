import { GetSpaceInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpacePath
 *
 * @description
 * Path of `GET` and `PATCH /internal/v1/spaces/{spaceId}`: a UUID, else `400 request.invalid`.
 */
export class SpacePath extends zodDto(GetSpaceInternalParams) {}
