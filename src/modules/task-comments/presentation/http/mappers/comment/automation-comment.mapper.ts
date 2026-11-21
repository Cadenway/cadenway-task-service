import {
  ApplyAutomationTaskCommentInternalBody,
  ApplyAutomationTaskCommentInternalHeader,
  ApplyAutomationTaskCommentInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';
import { z } from 'zod';

import type { AutomationCommentInput } from '../../../../application/models/comment/automation-comment-input.model.js';

/** Validates the signed rule principal and all contract inputs before authorization. */
export function toAutomationComment(request: Request): AutomationCommentInput {
  const principal = principalOf(request);
  if (principal?.issuer !== 'automation-service' || principal.actor.type !== 'automation') {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (principal.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  const rule = z.uuidv7().safeParse(principal.actor.id);
  // The actor-scoped receipt binds the signed text, so rule UUIDs use their lowercase form.
  if (!rule.success || rule.data !== rule.data.toLowerCase()) {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }

  const path = ApplyAutomationTaskCommentInternalParams.strict().safeParse(request.params);
  const body = ApplyAutomationTaskCommentInternalBody.safeParse(request.body);
  const key = ApplyAutomationTaskCommentInternalHeader.safeParse({
    'Idempotency-Key': request.headers['idempotency-key'],
  });
  const keyHeaders = request.rawHeaders.filter(
    (_value, index) =>
      index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'idempotency-key',
  );
  const issues: { in: string; path: string; code: string; message?: string }[] = [];
  if (
    !key.success ||
    !/^[\x21-\x7e]{1,255}$/u.test(key.data['Idempotency-Key']) ||
    keyHeaders.length > 1
  ) {
    issues.push({ in: 'header', path: 'Idempotency-Key', code: 'invalid_format' });
  }
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
            ? issue.keys.map((name) => ({
                in: 'body',
                path: [...issue.path, name].join('.'),
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
    ruleId: rule.data,
    ruleAuthorUserId: body.data.ruleAuthorUserId.toLowerCase(),
    body: body.data.body,
  };
}
