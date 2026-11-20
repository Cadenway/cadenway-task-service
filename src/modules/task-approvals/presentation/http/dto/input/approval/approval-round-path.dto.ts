import { VoteOnTaskApprovalInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** The task key and current round identifier. */
export class ApprovalRoundPath extends zodDto(VoteOnTaskApprovalInternalParams) {}
