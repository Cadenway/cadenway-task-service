import {
  ApplyAutomationTaskActionInternalBody,
  ApplyAutomationTaskActionInternalHeader,
  ApplyAutomationTaskActionInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';
import { z } from 'zod';

import type { ApplyAutomationTaskActionInput } from '../../../../application/use-cases/commands/task/apply-automation-task-action/apply-automation-task-action.input.js';

/** Extracts a validated action and its tenant and rule from the verified internal principal. */
export function toAutomationTaskAction(request: Request): ApplyAutomationTaskActionInput {
  const principal = principalOf(request);
  if (principal?.issuer !== 'automation-service' || principal.actor.type !== 'automation') {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (principal.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  const rule = z.uuidv7().safeParse(principal.actor.id);
  if (!rule.success) throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });

  const path = ApplyAutomationTaskActionInternalParams.strict().safeParse(request.params);
  const body = ApplyAutomationTaskActionInternalBody.safeParse(request.body);
  const key = ApplyAutomationTaskActionInternalHeader.safeParse({
    'Idempotency-Key': request.headers['idempotency-key'],
  });
  const keyHeaders = request.rawHeaders.filter(
    (_value, index) =>
      index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'idempotency-key',
  );
  const keyInvalid =
    !key.success ||
    !/^[\x21-\x7e]{1,255}$/u.test(key.data['Idempotency-Key']) ||
    keyHeaders.length > 1;
  if (!path.success || !body.success || keyInvalid || Object.keys(request.query).length !== 0) {
    const issue = keyInvalid
      ? { in: 'header', path: 'Idempotency-Key' }
      : !path.success
        ? { in: 'path', path: 'taskKey' }
        : Object.keys(request.query).length !== 0
          ? { in: 'query', path: '' }
          : { in: 'body', path: '' };
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: { issues: [{ ...issue, code: 'invalid_format' }] },
    });
  }
  return {
    organizationId: principal.organizationId.toLowerCase(),
    ruleId: rule.data.toLowerCase(),
    taskKey: path.data.taskKey,
    ruleAuthorUserId: body.data.ruleAuthorUserId.toLowerCase(),
    action:
      body.data.type === 'assign'
        ? { type: 'assign', userId: body.data.userId.toLowerCase() }
        : { type: 'priority', priority: body.data.priority },
  };
}
