import { ListTaskTimeEntriesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Pagination for a task's time entries. */
export class TimeEntriesQuery extends zodDto(ListTaskTimeEntriesInternalQueryParams.strict()) {}
