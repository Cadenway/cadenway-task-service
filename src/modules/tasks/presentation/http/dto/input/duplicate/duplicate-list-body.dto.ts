import { DuplicateListInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The strict empty body required to duplicate a list. */
export class DuplicateListBody extends zodDto(DuplicateListInternalBody) {}
