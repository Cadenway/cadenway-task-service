import { ApproveAccessRequestInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ApproveAccessRequestBody
 *
 * @description
 * Body of `POST /internal/v1/access-requests/{accessRequestId}/approval` (`AccessRequestApproval`):
 * the role, `edit`, `comment` or `view`, else `400 request.invalid`.
 */
export class ApproveAccessRequestBody extends zodDto(ApproveAccessRequestInternalBody) {}
