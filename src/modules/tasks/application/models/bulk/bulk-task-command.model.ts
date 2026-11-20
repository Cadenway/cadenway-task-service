import type { CancelReason } from '../../../domain/value-objects/task/cancel-reason.value-object.js';
import type { PriorityKey } from '../../../domain/value-objects/task/priority-key.value-object.js';
import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

/** The action applied to every selected task (P3b-2 decisions 17 and 18). */
export type BulkTaskCommand =
  | {
      readonly type: 'status';
      readonly status: StatusKey;
      readonly cancelReason?: CancelReason | null | undefined;
      readonly cancelNote?: string | null | undefined;
    }
  | { readonly type: 'priority'; readonly priority: PriorityKey }
  | { readonly type: 'assign'; readonly userId: string }
  | { readonly type: 'unassign'; readonly userId: string }
  | { readonly type: 'move'; readonly listId: string }
  | { readonly type: 'trash' }
  | { readonly type: 'duplicate' };
