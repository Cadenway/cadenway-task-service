import { GetSpaceCustomFieldInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The space and active custom field to read or change. */
export class CustomFieldPath extends zodDto(GetSpaceCustomFieldInternalParams) {}
