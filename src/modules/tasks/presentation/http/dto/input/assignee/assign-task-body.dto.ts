import { AssignTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class AssignTaskBody
 *
 * @description
 * Body of `PUT /internal/v1/tasks/{taskKey}/assignees/{userId}`: the empty object `{}` of the
 * contract (`EmptyRequest`). It carries nothing to read; it is bound so that a missing body, or one
 * that is not an object (an array, a text), answers `400 request.invalid`. The generated schema is
 * not strict, so the members of an object body are dropped, not refused: making it strict is a
 * change of the contract.
 */
export class AssignTaskBody extends zodDto(AssignTaskInternalBody) {}
