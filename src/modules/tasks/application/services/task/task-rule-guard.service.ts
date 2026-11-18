import { ParentInvalidError } from '../../../domain/errors/subtask/parent-invalid.error.js';
import { SubtaskDepthExceededError } from '../../../domain/errors/subtask/subtask-depth-exceeded.error.js';
import { SubtaskLimitReachedError } from '../../../domain/errors/subtask/subtask-limit-reached.error.js';
import { AssigneeInvalidError } from '../../../domain/errors/task/assignee-invalid.error.js';
import { AssigneeLimitReachedError } from '../../../domain/errors/task/assignee-limit-reached.error.js';
import { CancelReasonRequiredError } from '../../../domain/errors/task/cancel-reason-required.error.js';
import { CancelReasonUnexpectedError } from '../../../domain/errors/task/cancel-reason-unexpected.error.js';
import { ChecklistItemNotFoundError } from '../../../domain/errors/task/checklist-item-not-found.error.js';
import { ChecklistLimitReachedError } from '../../../domain/errors/task/checklist-limit-reached.error.js';
import { LabelLimitReachedError } from '../../../domain/errors/task/label-limit-reached.error.js';
import { ListInvalidError } from '../../../domain/errors/task/list-invalid.error.js';
import { StartDateInvalidError } from '../../../domain/errors/task/start-date-invalid.error.js';
import { StatusHiddenError } from '../../../domain/errors/task/status-hidden.error.js';
import { TaskRefusal } from '../../models/task/task-refusal.model.js';

/**
 * Class TaskRuleGuard
 *
 * @description
 * Runs a call of the domain and maps the refusals of its rules to those of the use cases
 * (`TaskRefusal`). It decides nothing: the rules stay in the domain. An error that is not the
 * refusal of a rule (an invalid value the API layer let through) passes untouched.
 */
export class TaskRuleGuard {
  // #region Methods
  /**
   * Method apply
   *
   * @description
   * Calls the domain.
   *
   * @param {() => TResult} rule - The call of the domain.
   * @returns {TResult} What the domain returned.
   * @throws {TaskRefusal} The refusal that matches the error of the domain.
   */
  public apply<TResult>(rule: () => TResult): TResult {
    try {
      return rule();
    } catch (error: unknown) {
      throw this.refusalOf(error) ?? error;
    }
  }

  /**
   * Method refusalOf
   *
   * @description
   * Maps an error of the domain to a refusal.
   *
   * @param {unknown} error - The error.
   * @returns {TaskRefusal | null} The refusal, `null` when the error is not a refusal of a rule.
   */
  private refusalOf(error: unknown): TaskRefusal | null {
    if (error instanceof StatusHiddenError) {
      return new TaskRefusal({ reason: 'status-hidden', status: error.status });
    }
    if (error instanceof AssigneeInvalidError) {
      return new TaskRefusal({ reason: 'assignee-invalid', userIds: error.userIds });
    }
    if (error instanceof ParentInvalidError) {
      return new TaskRefusal({ reason: 'parent-invalid', parentKey: error.parentKey });
    }
    if (error instanceof ChecklistItemNotFoundError) {
      return new TaskRefusal({ reason: 'checklist-item-not-found' });
    }
    if (error instanceof CancelReasonRequiredError) {
      return new TaskRefusal({ reason: 'cancel-reason-required' });
    }
    if (error instanceof CancelReasonUnexpectedError) {
      return new TaskRefusal({ reason: 'cancel-reason-unexpected' });
    }
    if (error instanceof AssigneeLimitReachedError) {
      return new TaskRefusal({ reason: 'assignee-limit-reached' });
    }
    if (error instanceof LabelLimitReachedError) {
      return new TaskRefusal({ reason: 'label-limit-reached' });
    }
    if (error instanceof ChecklistLimitReachedError) {
      return new TaskRefusal({ reason: 'checklist-limit-reached' });
    }
    if (error instanceof StartDateInvalidError) {
      return new TaskRefusal({ reason: 'start-date-invalid' });
    }
    if (error instanceof ListInvalidError) {
      return new TaskRefusal({ reason: 'list-invalid' });
    }
    if (error instanceof SubtaskDepthExceededError) {
      return new TaskRefusal({ reason: 'subtask-depth-exceeded' });
    }
    if (error instanceof SubtaskLimitReachedError) {
      return new TaskRefusal({ reason: 'subtask-limit-reached' });
    }
    return null;
  }
  // #endregion
}
