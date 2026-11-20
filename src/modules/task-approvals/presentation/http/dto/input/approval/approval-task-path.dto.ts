import { GetTaskApprovalInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The task key in an approval route. */
export class ApprovalTaskPath extends zodDto(GetTaskApprovalInternalParams) {}
