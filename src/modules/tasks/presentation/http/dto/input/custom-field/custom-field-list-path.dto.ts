import { ListListCustomFieldsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The list whose active field definitions are requested. */
export class CustomFieldListPath extends zodDto(ListListCustomFieldsInternalParams) {}
