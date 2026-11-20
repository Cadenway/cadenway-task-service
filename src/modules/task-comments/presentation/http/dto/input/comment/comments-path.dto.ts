import { ListTaskCommentsInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated task key for the comment page. */
export class CommentsPath extends zodDto(ListTaskCommentsInternalParams) {}
