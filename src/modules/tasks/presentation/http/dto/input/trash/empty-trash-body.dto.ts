import { EmptyTrashInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class EmptyTrashBody
 *
 * @description
 * Body of `POST /internal/v1/trash/empty`: the empty object `{}` of the contract (`EmptyRequest`),
 * validated and not read, so a missing body or one that is not an object answers
 * `400 request.invalid`.
 */
export class EmptyTrashBody extends zodDto(EmptyTrashInternalBody) {}
