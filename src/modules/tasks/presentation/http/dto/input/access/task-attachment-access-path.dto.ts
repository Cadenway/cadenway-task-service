import { CheckTaskAttachmentAccessInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated task key for an attachment access check. */
export class TaskAttachmentAccessPath extends zodDto(CheckTaskAttachmentAccessInternalParams) {}
