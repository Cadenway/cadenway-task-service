import type { PriorityKey } from '../../../../../domain/value-objects/task/priority-key.value-object.js';

/** A verified automation rule's task command and its authorizing member. */
export interface ApplyAutomationTaskActionInput {
  // #region Properties
  /** Tenant and actor claims and the validated rule action. */
  readonly organizationId: string;
  readonly taskKey: string;
  readonly ruleId: string;
  readonly ruleAuthorUserId: string;
  readonly action:
    | { readonly type: 'priority'; readonly priority: PriorityKey }
    | { readonly type: 'assign'; readonly userId: string };
  // #endregion
}
