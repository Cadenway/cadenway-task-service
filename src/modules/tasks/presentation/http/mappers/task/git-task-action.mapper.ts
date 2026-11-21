import {
  ApplyGitTaskStatusActionInternalBody,
  ApplyGitTaskStatusActionInternalHeader,
  ApplyGitTaskStatusActionInternalParams,
} from '@cadenway/contracts/validators/internal/task-service';
import { principalOf, ProblemException } from '@cadenway/nest-common';
import type { Request } from 'express';
import { z } from 'zod';

import type { ApplyGitTaskStatusInput } from '../../../../application/use-cases/commands/task/apply-git-task-status/apply-git-task-status.input.js';

/** Extracts one signed Git action after validating its path, body and required retry key. */
export function toGitTaskAction(request: Request): ApplyGitTaskStatusInput {
  const principal = principalOf(request);
  if (principal?.issuer !== 'integration-service' || principal.actor.type !== 'git') {
    throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });
  }
  if (principal.organizationId === null) {
    throw new ProblemException({ status: 403, code: 'auth.organization-required' });
  }
  const actor = z.uuidv7().safeParse(principal.actor.id);
  if (!actor.success) throw new ProblemException({ status: 403, code: 'auth.actor-not-allowed' });

  const path = ApplyGitTaskStatusActionInternalParams.strict().safeParse(request.params);
  const body = ApplyGitTaskStatusActionInternalBody.safeParse(request.body);
  const key = ApplyGitTaskStatusActionInternalHeader.safeParse({
    'Idempotency-Key': request.headers['idempotency-key'],
  });
  const keys = request.rawHeaders.filter(
    (_value, index) =>
      index % 2 === 0 && request.rawHeaders[index]?.toLowerCase() === 'idempotency-key',
  );
  const keyInvalid =
    !key.success || !/^[\x21-\x7e]{1,255}$/u.test(key.data['Idempotency-Key']) || keys.length > 1;
  const json = request.is('application/json') === 'application/json';
  if (
    !path.success ||
    !body.success ||
    !json ||
    keyInvalid ||
    Object.keys(request.query).length !== 0
  ) {
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
    integrationId: actor.data.toLowerCase(),
    taskKey: path.data.taskKey,
    spaceId: body.data.spaceId.toLowerCase(),
    mappingAuthorUserId: body.data.mappingAuthorUserId.toLowerCase(),
    provider: body.data.provider,
    status: body.data.status,
  };
}
