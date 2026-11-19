import { RefuseAccessRequestInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class RefuseAccessRequestBody
 *
 * @description
 * Body of `POST /internal/v1/access-requests/{accessRequestId}/refusal` (`EmptyRequest`): an
 * object, validated and not read, so that a missing body or an array answers `400`. The generated
 * schema is not strict, so the members of an object body are dropped.
 */
export class RefuseAccessRequestBody extends zodDto(RefuseAccessRequestInternalBody) {}
