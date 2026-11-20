import { GetTaskCommentInternalParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated task key and comment UUID. */
export class CommentPath extends zodDto(GetTaskCommentInternalParams) {}
