import { CreateSavedViewInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The parent UUID of the saved-view collection. */
export class SavedViewCollectionPath extends zodDto(CreateSavedViewInternalParams) {}
