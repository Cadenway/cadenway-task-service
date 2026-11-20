import { CreateFavoriteInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validates the target kind and ID using the published creation contract. */
export class CreateFavoriteBody extends zodDto(CreateFavoriteInternalBody) {}
