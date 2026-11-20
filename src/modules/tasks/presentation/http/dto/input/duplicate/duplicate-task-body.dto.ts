import { DuplicateTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The strict empty body required to duplicate one task. */
export class DuplicateTaskBody extends zodDto(DuplicateTaskInternalBody) {}
