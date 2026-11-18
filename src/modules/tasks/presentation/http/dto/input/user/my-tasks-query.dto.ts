import { ListMyTasksInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class MyTasksQuery
 *
 * @description
 * Query of `GET /internal/v1/users/{userId}/tasks`: the tab `state` (`open` by default, or
 * `closed`), the opaque `cursor` and the page size `limit`, 1 to 100 and 50 by default. An unknown
 * state and an unknown parameter answer `400 request.invalid`.
 */
export class MyTasksQuery extends zodDto(ListMyTasksInternalQueryParams) {}
