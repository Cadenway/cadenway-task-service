import { ListTaskTemplatesInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated space identifier of the library routes. */
export class TaskTemplateSpacePath extends zodDto(ListTaskTemplatesInternalParams) {}
