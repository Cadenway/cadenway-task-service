import { GetSpaceOverviewInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceOverviewPath
 *
 * @description
 * Path of `GET /internal/v1/spaces/{spaceId}/overview`: the id of the space, a UUID in either case,
 * else `400 request.invalid`.
 */
export class SpaceOverviewPath extends zodDto(GetSpaceOverviewInternalParams) {}
