import { ListSavedViewsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The published cursor and limit parameters of the collection. */
export class ListSavedViewsQuery extends zodDto(ListSavedViewsInternalQueryParams) {}
