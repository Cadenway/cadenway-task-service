import { GetFavoriteInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the favorite ID path parameter for reads. */
export class GetFavoritePath extends zodDto(GetFavoriteInternalParams) {}
