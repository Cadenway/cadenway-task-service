import { MilestoneDatesInvalidError } from '../../errors/task/milestone-dates-invalid.error.js';
import { MilestoneStatusInvalidError } from '../../errors/task/milestone-status-invalid.error.js';
import type { MilestoneFields } from '../../value-objects/task/milestone-fields.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { isScheduleValid } from './schedule.policy.js';

const MILESTONE_STATUS_KEYS: readonly StatusKey[] = Object.freeze([
  'todo',
  'blocked',
  'done',
  'cancelled',
]);

/**
 * Checks the persisted milestone invariant (P3b-2 decision 11 and the published `TaskPatch`).
 * Normal task rules still enforce status availability and a cancellation reason.
 *
 * @throws {MilestoneStatusInvalidError} When a milestone uses a status outside its workflow.
 * @throws {MilestoneDatesInvalidError} When its dates disagree, are invalid, or it has an estimate.
 */
export function requireValidMilestone(fields: MilestoneFields): void {
  if (!fields.milestone) return;
  if (!MILESTONE_STATUS_KEYS.includes(fields.status)) {
    throw new MilestoneStatusInvalidError();
  }
  if (
    fields.startDate !== fields.dueDate ||
    fields.estimateMinutes !== null ||
    !isScheduleValid(fields.dueDate, fields.startDate)
  ) {
    throw new MilestoneDatesInvalidError();
  }
}

/**
 * Resolves a task that will be a milestone after creation or a patch (P3b-2 decision 11).
 * An inherited incompatible status becomes `todo`. The start mirrors the due date and the
 * estimate is cleared unless explicitly supplied, in which case conflicting fields are refused.
 * Callers use ordinary task rules when this returns `null`, including on conversion back.
 */
export function resolveMilestone(
  current: MilestoneFields | null,
  change: Partial<MilestoneFields>,
): MilestoneFields | null {
  const milestone: boolean = change.milestone ?? current?.milestone ?? false;
  if (!milestone) return null;
  const previousStatus: StatusKey = current?.status ?? 'todo';
  const status: StatusKey =
    change.status ?? (MILESTONE_STATUS_KEYS.includes(previousStatus) ? previousStatus : 'todo');
  const dueDate: string | null =
    change.dueDate === undefined ? (current?.dueDate ?? null) : change.dueDate;
  const fields: MilestoneFields = {
    milestone,
    status,
    dueDate,
    startDate: change.startDate === undefined ? dueDate : change.startDate,
    estimateMinutes: change.estimateMinutes ?? null,
  };
  requireValidMilestone(fields);
  return fields;
}

/**
 * Whether a live task update reaches a milestone (P3b-2 decision 12). Invoke for genuine
 * updates of an existing live task. Creation, duplicate and restoration use their own facts.
 */
export function hasReachedMilestone(
  previousStatus: StatusKey,
  next: Pick<MilestoneFields, 'milestone' | 'status'>,
): boolean {
  return next.milestone && previousStatus !== 'done' && next.status === 'done';
}
