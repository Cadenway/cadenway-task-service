import { UpdateSavedViewInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import {
  checkLabels,
  requirePostgresText,
} from '../../../validation/view/storable-view-text.validator.js';

/** Validates the merge-patch vocabulary and rejects text PostgreSQL cannot store. */
export class UpdateSavedViewBody extends zodDto(
  UpdateSavedViewInternalBody.superRefine((body, context) => {
    requirePostgresText(context, body.name, ['name']);
    checkLabels(context, body.configuration?.filters?.label);
  }),
) {}
