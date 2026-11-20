import { CreateTaskDependencyInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The other task key and direction of a dependency creation. */
export class CreateDependencyBody extends zodDto(CreateTaskDependencyInternalBody) {}
