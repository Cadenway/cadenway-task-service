import { GetListInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListPath
 *
 * @description
 * Path of `GET` and `PATCH /internal/v1/lists/{listId}` and of its `archive` and `unarchive`
 * actions (the same `ListId` parameter of the contract): a UUID, else `400 request.invalid`.
 */
export class ListPath extends zodDto(GetListInternalParams) {}
