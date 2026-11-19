import { ListTrashInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TrashEntriesQuery
 *
 * @description
 * The query of `GET /internal/v1/trash/entries`: `cursor`, the `nextCursor` of a page of the trash,
 * and `limit`, 1 to 100 and 50 by default, as the contract declares them.
 */
export class TrashEntriesQuery extends zodDto(ListTrashInternalQueryParams) {}
