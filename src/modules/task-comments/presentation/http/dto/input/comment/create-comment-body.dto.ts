import { CreateTaskCommentInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Validated comment text and reply; structured mention semantics are checked in the write transaction. */
export class CreateCommentBody extends zodDto(
  CreateTaskCommentInternalBody.superRefine((body, context) => {
    if (body.body.includes('\0'))
      context.addIssue({ code: 'custom', path: ['body'], message: 'Text cannot contain U+0000.' });
  }),
) {}
