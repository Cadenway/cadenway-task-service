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
  const issues: { in: string; path: string; code: string; message?: string }[] = [];
  if (keyInvalid) issues.push({ in: 'header', path: 'Idempotency-Key', code: 'invalid_format' });
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
    const type =
      typeof request.body === 'object' && request.body !== null && 'type' in request.body
        ? (request.body as { readonly type: unknown }).type
        : undefined;
    const schema =
      type === 'assign'
        ? ApplyAutomationTaskActionInternalBody.options[0]
        : type === 'priority'
          ? ApplyAutomationTaskActionInternalBody.options[1]
          : ApplyAutomationTaskActionInternalBody;
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      issues.push(
        ...parsed.error.issues.flatMap<{ in: string; path: string; code: string; message: string }>(
          (issue) => {
            if (issue.code === 'unrecognized_keys') {
              return issue.keys.map((key) => ({
                in: 'body',
                path: [...issue.path, key].join('.'),
                code: issue.code,
                message: 'Unknown body property.',
              }));
            }
            return [
              {
                in: 'body',
                path: issue.path.join('.'),
                code: issue.code,
                message: issue.message,
              },
            ];
          },
        ),
      );
    }
  }
  if (issues.length > 0 || !path.success || !body.success) {
    throw new ProblemException({
      status: 400,
      code: 'request.invalid',
      details: { issues },
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
