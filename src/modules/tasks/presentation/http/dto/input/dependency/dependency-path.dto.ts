import { GetTaskDependencyInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The anchor task key and UUID of a dependency item. */
export class DependencyPath extends zodDto(GetTaskDependencyInternalParams) {}
