import { GetHomeInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class HomePath
 *
 * @description
 * Path of `GET /internal/v1/users/{userId}/home`: the account id of the actor, a UUID in either
 * case, else `400 request.invalid`. An account other than the actor's answers `404 user.not-found`
 * from the use case.
 */
export class HomePath extends zodDto(GetHomeInternalParams) {}
