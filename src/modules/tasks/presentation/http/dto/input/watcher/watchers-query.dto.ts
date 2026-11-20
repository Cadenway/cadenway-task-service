import { ListTaskWatchersInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the watcher page size and cursor. */
export class WatchersQuery extends zodDto(ListTaskWatchersInternalQueryParams) {}
