import { ListSpaceCustomFieldsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Cursor and limit for the ordered field definitions. */
export class CustomFieldQuery extends zodDto(ListSpaceCustomFieldsInternalQueryParams.strict()) {}
