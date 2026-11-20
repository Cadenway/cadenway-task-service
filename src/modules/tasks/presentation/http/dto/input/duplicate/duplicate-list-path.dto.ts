import { DuplicateListInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The UUID of the source list to duplicate. */
export class DuplicateListPath extends zodDto(DuplicateListInternalParams) {}
