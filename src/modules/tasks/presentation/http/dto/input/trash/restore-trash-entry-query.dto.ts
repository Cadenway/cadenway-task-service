import { RestoreTrashEntryInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated restoration query, including the optional pending-deletion report. */
export class RestoreTrashEntryQuery extends zodDto(RestoreTrashEntryInternalQueryParams) {}
