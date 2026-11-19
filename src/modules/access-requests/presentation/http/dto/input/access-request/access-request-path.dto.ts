import { ApproveAccessRequestInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class AccessRequestPath
 *
 * @description
 * Path of the approval and the refusal of `/internal/v1/access-requests/{accessRequestId}`: a
 * UUID, else `400 request.invalid`. Both routes declare the same parameter.
 */
export class AccessRequestPath extends zodDto(ApproveAccessRequestInternalParams) {}
