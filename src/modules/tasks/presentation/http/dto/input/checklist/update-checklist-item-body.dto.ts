import { UpdateChecklistItemInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class UpdateChecklistItemBody
 *
 * @description
 * Body of `PATCH /internal/v1/tasks/{taskKey}/checklist-items/{checklistItemId}`
 * (`ChecklistItemPatch`): `done`, which ticks or unticks the item, the one change of this version.
 */
export class UpdateChecklistItemBody extends zodDto(UpdateChecklistItemInternalBody) {}
