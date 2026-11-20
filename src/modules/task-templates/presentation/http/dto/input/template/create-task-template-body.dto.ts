import { CreateTaskTemplateInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

/** Published creation body, with text validated for PostgreSQL. */
export class CreateTaskTemplateBody extends zodDto(
  CreateTaskTemplateInternalBody.refine(({ name }) => !name?.includes('\u0000'), {
    path: ['name'],
    message: 'Expected text without a null character.',
  }),
) {}
