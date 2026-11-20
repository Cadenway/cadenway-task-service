import { ListFavoritesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the private collection cursor and page size using the published contract. */
export class ListFavoritesQuery extends zodDto(ListFavoritesInternalQueryParams) {}
