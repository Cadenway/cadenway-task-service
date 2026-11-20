import { ListTaskSearchProjectionsInternalQueryParams } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

const query = ListTaskSearchProjectionsInternalQueryParams.strict().superRefine(
  (params, context) => {
    if (params.kind === 'space' && params.spaceId !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['spaceId'],
        message: 'Expected a task or list export.',
      });
    }
    if (params.kind !== 'task' && params.listId !== undefined) {
      context.addIssue({ code: 'custom', path: ['listId'], message: 'Expected a task export.' });
    }
  },
);

/** Validates the published query and the placement filters allowed for the requested kind. */
export class TaskSearchProjectionQuery extends zodDto(query) {}
