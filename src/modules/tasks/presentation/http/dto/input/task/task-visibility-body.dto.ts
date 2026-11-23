import { GetTaskVisibilityInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates a closed batch of distinct task keys from the published contract. */
export class TaskVisibilityBody extends zodDto(GetTaskVisibilityInternalBody) {}
