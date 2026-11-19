import { ListArchivedListsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ArchivedListsQuery
 *
 * @description
 * Query of `GET /internal/v1/archives/lists`: the opaque `cursor` and the page size `limit`, 1 to
 * 100 and 50 by default. A parameter the contract does not declare answers `400 request.invalid`.
 */
export class ArchivedListsQuery extends zodDto(ListArchivedListsInternalQueryParams) {}
