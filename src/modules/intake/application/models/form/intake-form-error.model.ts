import { IntakeFormError } from '../../../domain/errors/form/intake-form.error.js';

/** Returns the domain refusal for presentation mapping without exposing the domain class. */
export function intakeFormFailureOf(error: unknown): IntakeFormError['failure'] | undefined {
  return error instanceof IntakeFormError ? error.failure : undefined;
}
