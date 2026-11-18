import { CreateListInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/**
 * Class SpaceListsPath
 *
 * @description
 * Path of `POST` and `GET /internal/v1/spaces/{spaceId}/lists`: a UUID, else `400 request.invalid`.
 */
export class SpaceListsPath extends zodDto(CreateListInternalParams) {}
