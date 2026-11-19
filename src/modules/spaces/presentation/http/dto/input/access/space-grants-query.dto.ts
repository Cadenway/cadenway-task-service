import { ListSpaceGrantsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceGrantsQuery
 *
 * @description
 * Query of `GET /internal/v1/spaces/{spaceId}/grants`: the opaque `cursor` and the page size
 * `limit`, 1 to 100 and 50 by default. A parameter the contract does not declare answers
 * `400 request.invalid`.
 */
export class SpaceGrantsQuery extends zodDto(ListSpaceGrantsInternalQueryParams) {}
