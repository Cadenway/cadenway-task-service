import { DuplicateSavedViewInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the required exactly empty duplication object. */
export class DuplicateSavedViewBody extends zodDto(DuplicateSavedViewInternalBody) {}
