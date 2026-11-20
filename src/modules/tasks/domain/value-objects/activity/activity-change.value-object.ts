import type { PriorityKey } from '../task/priority-key.value-object.js';
import type { StatusKey } from '../task/status-key.value-object.js';

/**
 * Type ActivityChange
 *
 * @description
 * What an activity entry records, by kind, with exactly the member of its kind
 * (`ActivityEntry` of `openapi/internal/task-service.yaml:2622-2721`):
 *
 * - `create`: no member;
 * - `status`: `status.from` and `status.to`, two different statuses;
 * - `priority`: `priority.from` and `priority.to`;
 * - `due`: `dueDate.from` (`null` when a due date is set) and `dueDate.to` (`null` when it is
 *   removed), never both `null`;
 * - `assign`: `assignee.userId`, added (`true`) or removed (`false`).
 *
 * @type {{ readonly kind: 'create' } | { readonly kind: 'status'; readonly status: { readonly from: StatusKey; readonly to: StatusKey } } | { readonly kind: 'priority'; readonly priority: { readonly from: PriorityKey; readonly to: PriorityKey } } | { readonly kind: 'due'; readonly dueDate: { readonly from: string | null; readonly to: string | null } } | { readonly kind: 'assign'; readonly assignee: { readonly userId: string; readonly added: boolean } }}
 */
export type ActivityChange =
  | { readonly kind: 'create' }
  | { readonly kind: 'comment'; readonly commentId: string; readonly commentExcerpt: string }
  | {
      readonly kind: 'status';
      readonly status: { readonly from: StatusKey; readonly to: StatusKey };
    }
  | {
      readonly kind: 'priority';
      readonly priority: { readonly from: PriorityKey; readonly to: PriorityKey };
    }
  | {
      readonly kind: 'due';
      readonly dueDate: { readonly from: string | null; readonly to: string | null };
    }
  | {
      readonly kind: 'assign';
      readonly assignee: { readonly userId: string; readonly added: boolean };
    };
