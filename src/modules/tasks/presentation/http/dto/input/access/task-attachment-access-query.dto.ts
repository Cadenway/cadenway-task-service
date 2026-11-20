import { CheckTaskAttachmentAccessInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Required operation mode, with unknown query parameters rejected. */
export class TaskAttachmentAccessQuery extends zodDto(
  CheckTaskAttachmentAccessInternalQueryParams.strict(),
) {}
