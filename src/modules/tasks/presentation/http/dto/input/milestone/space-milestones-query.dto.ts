import { ListSpaceMilestonesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Cursor and page size of the space milestone route. */
export class SpaceMilestonesQuery extends zodDto(ListSpaceMilestonesInternalQueryParams.strict()) {}
