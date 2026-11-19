import { CheckListAccessInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class ListAccessPath
 *
 * @description
 * Path of `GET /internal/v1/lists/{listId}/access`: a UUID, else `400 request.invalid`.
 */
export class ListAccessPath extends zodDto(CheckListAccessInternalParams) {}
