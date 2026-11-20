import { GetTaskTimeEntryInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** A task key and the UUID of one of its time entries. */
export class TimeEntryPath extends zodDto(GetTaskTimeEntryInternalParams) {}
