import { IntakeForm } from '../../../domain/aggregates/form/intake-form.aggregate.js';
import { IntakeFormError } from '../../../domain/errors/form/intake-form.error.js';
import type { IntakeEditorContext } from '../../../domain/policies/form/intake-editor-context.policy.js';
import { IntakeAccessError } from '../../models/form/intake-access-error.model.js';
import type { IntakeEditor } from '../../models/form/intake-editor.model.js';
import type { IntakeStore } from '../../models/form/intake-store.model.js';
import type { IntakeTarget } from '../../models/form/intake-target.model.js';
import type { IntakeUnitOfWork } from '../../ports/outbound/transactions/form/intake-unit-of-work.port.js';

/** A first read derives the default draft without creating a database row. */
export function currentIntakeForm(editor: IntakeEditor): IntakeForm {
  return editor.form ?? IntakeForm.create(editor.listName, editor.eligibility);
}

/** Adds the effective role to the domain refusal required by the HTTP problem contract. */
export function withIntakeRole<T>(access: IntakeEditorContext, action: () => T): T {
  try {
    return action();
  } catch (error: unknown) {
    if (
      error instanceof IntakeFormError &&
      error.failure.kind === 'role-insufficient' &&
      access.role !== null
    ) {
      throw new IntakeAccessError(access.role);
    }
    throw error;
  }
}

/** Saves only a mutation, inserting a first draft with its initial version when required. */
export async function saveIntakeForm(
  store: IntakeStore,
  listId: string,
  before: IntakeForm,
  after: IntakeForm,
  persisted: boolean,
): Promise<void> {
  if (before === after) return;
  await store.saveForm(listId, after.snapshot(), persisted ? before.snapshot().version : null);
}

/** Makes all unknown, stale and unavailable public keys indistinguishable. */
export async function resolveIntakeTarget(
  work: IntakeUnitOfWork,
  key: string,
): Promise<IntakeTarget> {
  const target = await work.resolvePublicKey(key);
  if (target === null) throw new IntakeFormError({ kind: 'unavailable' });
  return target;
}
