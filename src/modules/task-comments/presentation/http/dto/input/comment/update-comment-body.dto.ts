import { UpdateTaskCommentInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated patch; structured mention semantics are checked in the write transaction. */
export class UpdateCommentBody extends zodDto(
  UpdateTaskCommentInternalBody.superRefine((body, context) => {
    if (body.body?.includes('\0') === true)
      context.addIssue({ code: 'custom', path: ['body'], message: 'Text cannot contain U+0000.' });
  }),
) {}
