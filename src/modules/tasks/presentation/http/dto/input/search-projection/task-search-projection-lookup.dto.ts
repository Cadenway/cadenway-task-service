import type { SearchProjectionLookup } from '@cadenway/contracts/types/internal/task-service';
import { ResolveTaskSearchProjectionsInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the strict published body and identifier pattern for its selected kind. */
export class TaskSearchProjectionLookup extends zodDto<
  Pick<SearchProjectionLookup, 'kind' | 'ids'>
>(ResolveTaskSearchProjectionsInternalBody) {}
