import { ListSpaceCustomFieldsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The space containing custom field definitions. */
export class CustomFieldSpacePath extends zodDto(ListSpaceCustomFieldsInternalParams) {}
