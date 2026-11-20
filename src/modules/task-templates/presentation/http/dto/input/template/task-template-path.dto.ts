import { GetTaskTemplateInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated parent and item identifiers of a template. */
export class TaskTemplatePath extends zodDto(GetTaskTemplateInternalParams) {}
