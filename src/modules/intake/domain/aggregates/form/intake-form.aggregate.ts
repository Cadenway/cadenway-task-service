import { IntakeFormError } from '../../errors/form/intake-form.error.js';
import type { IntakeDefaultsEligibility } from '../../policies/form/intake-defaults-eligibility.policy.js';
import type { IntakeEditorContext } from '../../policies/form/intake-editor-context.policy.js';
import type { IntakePublicationContext } from '../../policies/form/intake-publication-context.policy.js';
import { validateIntakeSubmission } from '../../policies/submission/validate-intake-submission.policy.js';
import type { IntakeFormConfiguration } from '../../value-objects/form/intake-form-configuration.value-object.js';
import type { IntakeFormFields } from '../../value-objects/form/intake-form-fields.value-object.js';
import type { IntakeFormPatch } from '../../value-objects/form/intake-form-patch.value-object.js';
import type { IntakeStatus } from '../../value-objects/form/intake-status.value-object.js';
import type { PublicIntakeForm } from '../../value-objects/form/public-intake-form.value-object.js';
import type { IntakeSubmissionInput } from '../../value-objects/submission/intake-submission-input.value-object.js';
import type { IntakeSubmission } from '../../value-objects/submission/intake-submission.value-object.js';

const fields = ['description', 'priority', 'dueDate', 'contactEmail'] as const;
const modes = ['disabled', 'optional', 'required'] as const;
const statuses: readonly IntakeStatus[] = [
  'triage',
  'backlog',
  'todo',
  'progress',
  'review',
  'testing',
  'waiting',
  'blocked',
  'done',
  'cancelled',
];

function checkEditor(access: IntakeEditorContext): void {
  if (access.lifecycle === 'removed' || access.role === null) {
    throw new IntakeFormError({ kind: 'list-not-found' });
  }
  if (access.role !== 'edit') throw new IntakeFormError({ kind: 'role-insufficient' });
}

function checkActiveList(access: IntakeEditorContext): void {
  if (access.lifecycle !== 'active') throw new IntakeFormError({ kind: 'list-archived' });
}

/** A cancelled task always needs a reason, which the public intake does not accept. */
function invalidDefault(
  form: IntakeFormConfiguration,
  eligibility: IntakeDefaultsEligibility,
): 'defaultStatus' | 'defaultAssigneeId' | undefined {
  if (form.defaultStatus === 'cancelled' || !eligibility.allowedStatuses.has(form.defaultStatus)) {
    return 'defaultStatus';
  }
  if (
    form.defaultAssigneeId !== null &&
    !eligibility.eligibleAssignees.has(form.defaultAssigneeId)
  ) {
    return 'defaultAssigneeId';
  }
  return undefined;
}

function checkDefaults(
  state: IntakeFormConfiguration,
  eligibility: IntakeDefaultsEligibility,
): void {
  const field = invalidDefault(state, eligibility);
  if (field !== undefined) throw new IntakeFormError({ kind: 'defaults-invalid', field });
}

function checkKey(key: string | undefined): string {
  if (key?.length !== 43 || !/^[A-Za-z0-9_-]{43}$/.test(key)) {
    throw new IntakeFormError({ kind: 'invalid-publication-key' });
  }
  return key;
}

function normalizedTitle(value: string): string {
  const title = value.trim();
  if (title === '' || Array.from(title).length > 300) {
    throw new IntakeFormError({ kind: 'invalid-settings', field: 'title' });
  }
  return title;
}

function checkedState(state: IntakeFormConfiguration): IntakeFormConfiguration {
  if (!Number.isSafeInteger(state.version) || state.version < 1) {
    throw new IntakeFormError({ kind: 'invalid-settings', field: 'version' });
  }
  if (state.description !== null && Array.from(state.description).length > 500) {
    throw new IntakeFormError({ kind: 'invalid-settings', field: 'description' });
  }
  if (fields.some((field) => !modes.includes(state.fields[field]))) {
    throw new IntakeFormError({ kind: 'invalid-settings', field: 'fields' });
  }
  if (!statuses.includes(state.defaultStatus)) {
    throw new IntakeFormError({ kind: 'defaults-invalid', field: 'defaultStatus' });
  }
  if (
    state.defaultAssigneeId !== null &&
    (state.defaultAssigneeId.length !== 36 ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(state.defaultAssigneeId))
  ) {
    throw new IntakeFormError({ kind: 'defaults-invalid', field: 'defaultAssigneeId' });
  }
  if (state.publicKey !== null) checkKey(state.publicKey);

  const { description, priority, dueDate, contactEmail } = state.fields;
  const formFields: IntakeFormFields = Object.freeze({
    description,
    priority,
    dueDate,
    contactEmail,
  });
  return Object.freeze({
    title: normalizedTitle(state.title),
    description: state.description,
    fields: formFields,
    defaultStatus: state.defaultStatus,
    defaultAssigneeId: state.defaultAssigneeId,
    publicKey: state.publicKey,
    version: state.version,
  });
}

function sameSettings(left: IntakeFormConfiguration, right: IntakeFormConfiguration): boolean {
  return (
    left.title === right.title &&
    left.description === right.description &&
    left.defaultStatus === right.defaultStatus &&
    left.defaultAssigneeId === right.defaultAssigneeId &&
    fields.every((field) => left.fields[field] === right.fields[field])
  );
}

/**
 * A list's intake draft and its current anonymous publication. It enforces the administrator and
 * applicant rules in the P3c brief, decision 11, and in the public intake operations.
 */
export class IntakeForm {
  // #region Properties
  /** Immutable configuration and its current publication key. */
  private readonly state: IntakeFormConfiguration;
  // #endregion

  // #region Constructor
  /** Keeps a checked, immutable snapshot. */
  private constructor(state: IntakeFormConfiguration) {
    this.state = checkedState(state);
  }
  // #endregion

  // #region Methods
  /** Uses the neutral text and task defaults defined in the public intake contract. */
  public static create(eligibility: IntakeDefaultsEligibility): IntakeForm {
    return new IntakeForm({
      title: 'Déposer une demande',
      description: 'Décrivez votre besoin en quelques mots.',
      fields: {
        description: 'optional',
        priority: 'optional',
        dueDate: 'optional',
        contactEmail: 'required',
      },
      defaultStatus: eligibility.allowedStatuses.has('triage') ? 'triage' : 'todo',
      defaultAssigneeId: null,
      publicKey: null,
      version: 1,
    });
  }

  /** Restores a saved configuration, which may have become ineligible since it was stored. */
  public static reconstitute(state: IntakeFormConfiguration): IntakeForm {
    return new IntakeForm(state);
  }

  /** Provides the immutable state to the intake repository. */
  public snapshot(): IntakeFormConfiguration {
    return this.state;
  }

  /** Only a current editor may see management settings, including on an archived list. */
  public configuration(access: IntakeEditorContext): IntakeFormConfiguration {
    checkEditor(access);
    return this.state;
  }

  /** Applies a conditional merge patch and preserves the current publication. */
  public configure(
    access: IntakeEditorContext,
    version: number,
    patch: IntakeFormPatch,
    eligibility: IntakeDefaultsEligibility,
  ): IntakeForm {
    checkEditor(access);
    checkActiveList(access);
    this.checkVersion(version);

    const current = this.state;
    const proposed = checkedState({
      title: patch.title ?? current.title,
      description: patch.description === undefined ? current.description : patch.description,
      fields: { ...current.fields, ...patch.fields },
      defaultStatus: patch.defaultStatus ?? current.defaultStatus,
      defaultAssigneeId:
        patch.defaultAssigneeId === undefined ? current.defaultAssigneeId : patch.defaultAssigneeId,
      publicKey: current.publicKey,
      version: current.version,
    });
    checkDefaults(proposed, eligibility);
    if (sameSettings(current, proposed)) return this;
    return new IntakeForm({ ...proposed, version: current.version + 1 });
  }

  /** Keeps a live key or accepts a fresh, never-used opaque key supplied by the application. */
  public publish(
    access: IntakeEditorContext,
    version: number | undefined,
    eligibility: IntakeDefaultsEligibility,
    newKey?: string,
  ): IntakeForm {
    checkEditor(access);
    checkActiveList(access);
    if (version !== undefined) this.checkVersion(version);
    checkDefaults(this.state, eligibility);

    if (this.state.publicKey !== null) return this;
    return this.withKey(checkKey(newKey));
  }

  /** An editor can disable a publication even while its list is archived. */
  public disable(access: IntakeEditorContext, version: number | undefined): IntakeForm {
    checkEditor(access);
    if (version !== undefined) this.checkVersion(version);
    return this.revoke();
  }

  /** List removal revokes the current publication. Archiving only suspends it. */
  public revoke(): IntakeForm {
    if (this.state.publicKey === null) return this;
    return this.withKey(null);
  }

  /** Exposes only the applicant projection of an eligible, active publication. */
  public publicForm(context: IntakePublicationContext): PublicIntakeForm {
    this.checkPublication(context);
    const { title, description, fields: formFields } = this.state;
    return { title, description, fields: formFields };
  }

  /** Rechecks the anonymous publication before turning an input into normal task data. */
  public submit(context: IntakePublicationContext, input: IntakeSubmissionInput): IntakeSubmission {
    this.checkPublication(context);
    return validateIntakeSubmission(this.state, input);
  }

  /** Checks the current version after checking the editor's role and the list lifecycle. */
  private checkVersion(expected: number): void {
    if (expected !== this.state.version) {
      throw new IntakeFormError({ kind: 'version-mismatch', currentVersion: this.state.version });
    }
  }

  /** Changes the publication and increments the version once. */
  private withKey(publicKey: string | null): IntakeForm {
    return new IntakeForm({ ...this.state, publicKey, version: this.state.version + 1 });
  }

  /** Every unavailable publication produces the same refusal. */
  private checkPublication(context: IntakePublicationContext): void {
    if (
      this.state.publicKey === null ||
      this.state.publicKey !== context.key ||
      context.lifecycle !== 'active' ||
      invalidDefault(this.state, context.eligibility) !== undefined
    ) {
      throw new IntakeFormError({ kind: 'unavailable' });
    }
  }
  // #endregion
}
