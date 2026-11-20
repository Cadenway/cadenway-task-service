import { CreateSavedViewInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import {
  checkLabels,
  requirePostgresText,
} from '../../../validation/view/storable-view-text.validator.js';

/** Validates the published creation body and rejects text PostgreSQL cannot store. */
export class CreateSavedViewBody extends zodDto(
  CreateSavedViewInternalBody.superRefine((body, context) => {
    requirePostgresText(context, body.name, ['name']);
    checkLabels(context, body.configuration.filters.label);
  }),
) {}
