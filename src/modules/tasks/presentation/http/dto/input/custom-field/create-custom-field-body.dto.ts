import { CreateSpaceCustomFieldInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';
import { refuseMalformedCustomFieldText } from '../../../validation/custom-field/custom-field-text.validator.js';

/** The contract body of a custom field creation. */
export class CreateCustomFieldBody extends zodDto(
  CreateSpaceCustomFieldInternalBody.superRefine((body, context) => {
    refuseUnstorableValues(context, body);
    refuseMalformedCustomFieldText(context, body.name, ['name']);
  }),
) {}
