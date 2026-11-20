import { ListTaskCommentsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated page size and opaque cursor. */
export class CommentsQuery extends zodDto(ListTaskCommentsInternalQueryParams) {}
