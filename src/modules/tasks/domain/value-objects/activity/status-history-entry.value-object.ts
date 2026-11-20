import type { ActivityChange } from './activity-change.value-object.js';
import type { ActivityEntryState } from './activity-entry-state.value-object.js';

/** The creation or transition facts needed to measure elapsed time in task statuses. */
export type StatusHistoryEntry = Pick<ActivityEntryState, 'id' | 'occurredAt' | 'initialStatus'> & {
  readonly change: Extract<ActivityChange, { readonly kind: 'create' | 'status' }>;
};
