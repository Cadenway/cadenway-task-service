import { ListTaskDependenciesInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The page size and task-bound cursor for a dependency collection. */
export class ListDependenciesQuery extends zodDto(ListTaskDependenciesInternalQueryParams) {}
