import { UnarchiveTaskInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class UnarchiveTaskBody
 *
 * @description
 * Body of `POST /internal/v1/tasks/{taskKey}/unarchive`: the empty object `{}` of the contract
 * (`EmptyRequest`). It carries nothing to read; it is bound so that a missing body, or one that is
 * not an object (an array, a text), answers `400 request.invalid`. The contract already closes
 * the object (`additionalProperties: false`), but the validator its generator emits is not strict,
 * so the members of an object body are dropped, not refused: a gap of the generator of
 * cadenway-api-contracts, reported there; this service keeps the generated behavior.
 */
export class UnarchiveTaskBody extends zodDto(UnarchiveTaskInternalBody) {}
