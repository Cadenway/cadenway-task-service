import { RequestTaskApprovalInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Reviewers for a new approval round. */
export class RequestApprovalBody extends zodDto(RequestTaskApprovalInternalBody) {}
