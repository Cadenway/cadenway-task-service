import {
  AuthorizeAutomationNotificationInternalBody,
  AuthorizeAutomationNotificationInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';

import type { AuthorizeAutomationNotificationInput } from '../../../../application/use-cases/queries/task/authorize-automation-notification/authorize-automation-notification.input.js';

/** Extracts the verified tenant and validates the notification's two accounts. */
export function toAutomationNotificationAuthorization(
  request: Request,
): AuthorizeAutomationNotificationInput {
  const principal = principalOf(request);
  if (
    principal?.issuer !== 'notification-service' ||
    principal.actor.type !== 'system' ||
    principal.actor.id !== 'notification-service'
  ) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (principal.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }

  const path = AuthorizeAutomationNotificationInternalParams.strict().safeParse(request.params);
  const body = AuthorizeAutomationNotificationInternalBody.safeParse(request.body);
  const issues: { in: string; path: string; code: string; message?: string }[] = [];
  if (!path.success) {
    issues.push(
      ...path.error.issues.map((issue) => ({
        in: 'path',
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    );
  }
  for (const name of Object.keys(request.query)) {
    issues.push({ in: 'query', path: name, code: 'unrecognized_parameter' });
  }
  if (request.is('application/json') !== 'application/json') {
    issues.push({
      in: 'body',
      path: '',
      code: 'invalid_type',
      message: 'Expected application/json.',
    });
  } else if (!body.success) {
    issues.push(
      ...body.error.issues.flatMap<{ in: string; path: string; code: string; message: string }>(
        (issue) =>
          issue.code === 'unrecognized_keys'
            ? issue.keys.map((key) => ({
                in: 'body',
                path: [...issue.path, key].join('.'),
                code: issue.code,
                message: 'Unknown body property.',
              }))
            : [
                {
                  in: 'body',
                  path: issue.path.join('.'),
                  code: issue.code,
                  message: issue.message,
                },
              ],
      ),
    );
  }
  if (issues.length > 0 || !path.success || !body.success) {
    throw new ProblemException({ status: 400, code: 'request.invalid', details: { issues } });
  }
  return {
    organizationId: principal.organizationId.toLowerCase(),
    taskKey: path.data.taskKey,
    ruleAuthorUserId: body.data.ruleAuthorUserId.toLowerCase(),
    recipientUserId: body.data.recipientUserId.toLowerCase(),
  };
}
