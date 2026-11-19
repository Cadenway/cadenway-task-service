import { ArchiveListInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ArchiveListBody
 *
 * @description
 * Body of `POST /internal/v1/lists/{listId}/archive`: the empty object `{}` of the contract
 * (`EmptyRequest`). It carries nothing to read; it is bound so that a missing body, or one that is
 * not an object (an array, a text), answers `400 request.invalid`. The contract declares the body
 * `additionalProperties: false`, but the validator cadenway-api-contracts generates from it is not
 * strict (`zod.object({})`), so the members of an object body are dropped, not refused: a gap of
 * that generator, reported to cadenway-api-contracts; this route keeps the generated validator
 * until a release of the contracts makes it strict.
 */
export class ArchiveListBody extends zodDto(ArchiveListInternalBody) {}
