import { ListTaskTemplatesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Published cursor and page-size query of the template library. */
export class ListTaskTemplatesQuery extends zodDto(ListTaskTemplatesInternalQueryParams) {}
