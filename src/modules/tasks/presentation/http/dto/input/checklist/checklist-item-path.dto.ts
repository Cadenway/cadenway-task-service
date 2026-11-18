import { UpdateChecklistItemInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ChecklistItemPath
 *
 * @description
 * Path of `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}`: the key of the
 * task and the id of the item, a UUID in either case, else `400 request.invalid`.
 */
export class ChecklistItemPath extends zodDto(UpdateChecklistItemInternalParams) {}
