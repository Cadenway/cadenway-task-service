import { RestoreTrashEntryInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class TrashEntryPath
 *
 * @description
 * The path of a trash entry (`EntryId` of the contract): a UUID, any other text answering
 * `400 request.invalid`. The erasure and the restoration declare the same parameter.
 */
export class TrashEntryPath extends zodDto(RestoreTrashEntryInternalParams) {}
