import { IntakeFormError } from '../../errors/form/intake-form.error.js';
import type { IntakeFormConfiguration } from '../../value-objects/form/intake-form-configuration.value-object.js';
import type { IntakeFormFields } from '../../value-objects/form/intake-form-fields.value-object.js';
import type { IntakeSubmissionInput } from '../../value-objects/submission/intake-submission-input.value-object.js';
import type { IntakeSubmissionIssue } from '../../value-objects/submission/intake-submission-issue.value-object.js';
import type { IntakeSubmission } from '../../value-objects/submission/intake-submission.value-object.js';
import { normalizeIntakeAttachmentIds } from './normalize-intake-attachment-ids.policy.js';

type IssueReason = IntakeSubmissionIssue['reason'];

/** Date values follow the same calendar and year bounds as normal task creation. */
function isCalendarDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;

  if (month === 2) {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return day <= (leapYear ? 29 : 28);
  }
  return day <= ([4, 6, 9, 11].includes(month) ? 30 : 31);
}

/** The applicant form in App.dc.html only accepts a contact address with a dotted domain. */
function isEmail(value: string): boolean {
  return value.length <= 254 && value === value.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPriority(value: string): value is IntakeSubmission['task']['priority'] {
  return value === 'urgente' || value === 'haute' || value === 'moyenne' || value === 'basse';
}

function fieldIssue(
  mode: IntakeFormFields[keyof IntakeFormFields],
  value: string | null | undefined,
  valid: (value: string) => boolean,
  nullable = false,
): IssueReason | undefined {
  if (mode === 'disabled') return value === undefined ? undefined : 'disabled';
  if (mode === 'required' && (value == null || value.trim() === '')) return 'required';
  if (value === undefined || (value === null && nullable)) return undefined;
  if (value === null || !valid(value)) return 'invalid';
  return undefined;
}

/**
 * Enforces the live modes and task input bounds before any task creation.
 * The P3c brief, decision 11, keeps the contact separate from the normal task inputs.
 */
export function validateIntakeSubmission(
  form: IntakeFormConfiguration,
  input: IntakeSubmissionInput,
): IntakeSubmission {
  const title = input.title.trim();
  const issues: IntakeSubmissionIssue[] = [];
  const check: (
    field: Exclude<keyof IntakeFormFields, 'attachments'>,
    valid: (value: string) => boolean,
    nullable?: boolean,
  ) => void = (field, valid, nullable) => {
    const reason = fieldIssue(form.fields[field], input[field], valid, nullable);
    if (reason !== undefined) issues.push({ field, reason });
  };

  if (title === '') issues.push({ field: 'title', reason: 'required' });
  else if (Array.from(title).length > 300) issues.push({ field: 'title', reason: 'invalid' });
  check('description', (description) => Array.from(description).length <= 50_000, true);
  check('priority', isPriority);
  check('dueDate', isCalendarDate);
  check('contactEmail', isEmail);
  const attachmentMode = form.fields.attachments ?? 'optional';
  const attachmentCount = input.attachmentIds?.length ?? 0;
  if (attachmentMode === 'disabled' && attachmentCount > 0) {
    issues.push({ field: 'attachmentIds', reason: 'disabled' });
  } else if (attachmentMode === 'required' && attachmentCount === 0) {
    issues.push({ field: 'attachmentIds', reason: 'required' });
  }
  if (issues.length > 0) throw new IntakeFormError({ kind: 'invalid-submission', issues });
  normalizeIntakeAttachmentIds(input.attachmentIds);

  return {
    task: {
      title,
      description: input.description ?? null,
      priority: input.priority != null && isPriority(input.priority) ? input.priority : 'moyenne',
      dueDate: input.dueDate ?? null,
      status: form.defaultStatus,
      assigneeId: form.defaultAssigneeId,
    },
    contactEmail: input.contactEmail ?? null,
  };
}
