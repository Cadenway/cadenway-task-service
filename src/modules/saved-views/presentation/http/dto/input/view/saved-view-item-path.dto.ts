import { GetSavedViewInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The parent and view UUIDs of a saved-view resource. */
export class SavedViewItemPath extends zodDto(GetSavedViewInternalParams) {}
