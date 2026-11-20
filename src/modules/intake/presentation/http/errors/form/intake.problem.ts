import { ProblemException } from '@cadenway/nest-common';

import { IntakeAccessError } from '../../../../application/models/form/intake-access-error.model.js';
import { IntakeResourceError } from '../../../../application/models/form/intake-resource-error.model.js';
import { IntakeSubmissionError } from '../../../../application/models/form/intake-submission-error.model.js';
import { intakeFormFailureOf } from '../../../../application/models/form/intake-form-error.model.js';
import { IntakeAttachmentError } from '../../../../application/models/attachment/intake-attachment-error.model.js';

/** Converts documented intake refusals to safe internal problems. */
export async function answerIntakeRefusals<T>(
  work: () => Promise<T>,
  concealDisabled = false,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof IntakeAttachmentError) {
      switch (error.failure) {
        case 'invalid-draft':
        case 'unavailable':
        case 'invalid-transition':
          throw new ProblemException({ status: 404, code: 'intake-form.not-found' });
        case 'upload-not-ready':
          throw new ProblemException({ status: 409, code: 'attachment.upload-not-ready' });
        case 'disabled':
          throw new ProblemException(
            concealDisabled
              ? { status: 404, code: 'intake-form.not-found' }
              : { status: 422, code: 'intake-form.attachments-disabled' },
          );
        case 'limit-exceeded':
          throw new ProblemException({
            status: 422,
            code: 'intake-form.attachment-limit-exceeded',
          });
        case 'file-too-large':
          throw new ProblemException({ status: 422, code: 'attachment.file-too-large' });
        case 'idempotency-key-reused':
          throw new ProblemException({ status: 422, code: 'idempotency.key-reused' });
        case 'invalid-declaration':
          throw new ProblemException({ status: 400, code: 'request.invalid' });
      }
    }
    if (error instanceof IntakeAccessError) {
      throw new ProblemException({
        status: 403,
        code: 'access.role-insufficient',
        details: { role: error.role, requiredRole: error.requiredRole },
      });
    }
    if (error instanceof IntakeResourceError) {
      const failure = error.failure;
      if (failure.kind === 'task-trashed') {
        throw new ProblemException({
          status: 404,
          code: 'task.trashed',
          details: { ...failure.details },
        });
      }
      throw new ProblemException({
        status: 404,
        code: failure.kind === 'task-not-found' ? 'task.not-found' : 'organization.not-found',
      });
    }
    if (error instanceof IntakeSubmissionError) {
      throw new ProblemException({
        status: error.reason === 'in-progress' ? 409 : 422,
        code:
          error.reason === 'in-progress'
            ? 'idempotency.request-in-progress'
            : 'idempotency.key-reused',
      });
    }
    const failure = intakeFormFailureOf(error);
    if (failure !== undefined) {
      switch (failure.kind) {
        case 'list-not-found':
          throw new ProblemException({ status: 404, code: 'list.not-found' });
        case 'unavailable':
        case 'invalid-publication-key':
          throw new ProblemException({ status: 404, code: 'intake-form.not-found' });
        case 'list-archived':
          throw new ProblemException({ status: 409, code: 'intake-form.list-archived' });
        case 'version-mismatch':
          throw new ProblemException({
            status: 412,
            code: 'request.version-mismatch',
            details: { version: failure.currentVersion },
          });
        case 'defaults-invalid':
          throw new ProblemException({
            status: 422,
            code: 'intake-form.defaults-invalid',
            details: { field: failure.field },
          });
        case 'invalid-settings':
          throw new ProblemException({
            status: 400,
            code: 'request.invalid',
            details: {
              issues: [
                {
                  in: 'body',
                  path: failure.field,
                  code: 'invalid',
                  message: 'Invalid form setting.',
                },
              ],
            },
          });
        case 'invalid-submission':
          throw new ProblemException({
            status: 400,
            code: 'request.invalid',
            details: {
              issues: failure.issues.map(({ field, reason }) => ({
                in: 'body',
                path: field,
                code: reason,
                message: 'The field does not match the published form.',
              })),
            },
          });
        case 'role-insufficient':
          throw new ProblemException({ status: 403, code: 'access.role-insufficient' });
      }
    }
    throw error;
  }
}
