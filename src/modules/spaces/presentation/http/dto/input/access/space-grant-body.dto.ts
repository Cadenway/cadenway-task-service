import { SetSpaceGrantInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceGrantBody
 *
 * @description
 * Body of `PUT /internal/v1/spaces/{spaceId}/grants/{userId}` (`GrantChange`): the role to give,
 * `edit`, `comment` or `view`, else `400 request.invalid`. Members the contract does not declare
 * are dropped.
 */
export class SpaceGrantBody extends zodDto(SetSpaceGrantInternalBody) {}
