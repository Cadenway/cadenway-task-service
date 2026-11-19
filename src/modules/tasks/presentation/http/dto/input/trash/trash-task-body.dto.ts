import { TrashTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TrashTaskBody
 *
 * @description
 * Body of `POST /internal/v1/tasks/{taskKey}/trash`: the empty object `{}` of the contract
 * (`EmptyRequest`). It carries nothing to read; it is bound so that a missing body, or one that is
 * not an object (an array, a text), answers `400 request.invalid`. As for the archive, the
 * generated validator is not strict, so the members of an object body are dropped, not refused.
 */
export class TrashTaskBody extends zodDto(TrashTaskInternalBody) {}
