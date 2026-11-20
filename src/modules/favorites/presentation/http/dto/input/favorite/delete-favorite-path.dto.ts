import { DeleteFavoriteInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the favorite ID path parameter for deletion. */
export class DeleteFavoritePath extends zodDto(DeleteFavoriteInternalParams) {}
