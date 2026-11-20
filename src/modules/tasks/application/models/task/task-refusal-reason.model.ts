import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';
import type { AccessRole } from '../../../domain/value-objects/access/access-role.value-object.js';
import type { TaskActor } from '../../../domain/value-objects/task/task-actor.value-object.js';

/**
 * Type TaskRefusalReason
 *
 * @description
 * Why a use case of the tasks module refuses a request, with what the caller needs to answer it
 * (`openapi/internal/task-service.yaml`): the presentation layer maps each reason to its problem.
 *
 * - `organization-not-found`: the copy of the memberships does not hold the actor as a member.
 * - `task-not-found`, `list-not-found`, `space-not-found`, `checklist-item-not-found`: unknown, or
 *   not seen by the actor.
 * - `user-not-found`: the `userId` of a route of the tasks of the actor is not the actor.
 * - `role-insufficient`: the actor sees the list a change acts on (the list of the task, the list
 *   a task is created in or moved to, the list of the new parent) with `role`, and needs `edit`.
 * - `task-archived`: the task a change acts on, or the parent a new subtask or an attachment
 *   names, is archived ("Tasks" of `openapi/public/archives.yaml`); `key` is its key.
 * - `task-trashed`: the task of the key is in the trash and the actor could change its list, as if
 *   the list and its space were not deleted (`TaskNotFound` of `openapi/public/tasks.yaml`): its
 *   key and name, its entry, the root of the entry, when and by whom it was deleted and when it is
 *   erased. Anyone else gets `task-not-found`.
 * - `trash-entry-not-found`: no entry with this id that the actor may restore: unknown, handed to
 *   the purge by "Vider la corbeille", or of a list the actor could not change; for a
 *   restoration, also an entry of a deleted list whose deletion job has not moved all its tasks
 *   yet when the caller did not request its status.
 * - `trash-entry-not-restorable-yet`: an otherwise restorable entry awaits list deletion.
 * - `trash-writes-disabled`: the switch of the writes of the trash is off (`TrashWrites`): the
 *   route answers as one the service does not have.
 * - `version-mismatch`: `If-Match` names another version than the stored one.
 * - `status-hidden`: the status is hidden in the space the task is in after the operation.
 * - `cancel-reason-required`, `cancel-reason-unexpected`: the cancellation rules.
 * - `assignee-invalid`: an account is not a current member other than a guest.
 * - `assignee-limit-reached`, `label-limit-reached`, `checklist-limit-reached`: 20, 20 and 100.
 * - `start-date-invalid`: a start without a due date, or after it.
 * - `list-invalid`: the target list is unknown, not seen, or not the one of the new parent.
 * - `parent-invalid`: the parent is unknown, not seen, the task or one of its descendants.
 * - `subtask-depth-exceeded`, `subtask-limit-reached`: 3 levels, 25 direct subtasks.
 */
export type TaskRefusalReason =
  | { readonly reason: 'organization-not-found' }
  | { readonly reason: 'task-not-found' }
  | { readonly reason: 'list-not-found' }
  | { readonly reason: 'space-not-found' }
  | { readonly reason: 'user-not-found' }
  | { readonly reason: 'checklist-item-not-found' }
  | { readonly reason: 'role-insufficient'; readonly role: AccessRole }
  | { readonly reason: 'task-archived'; readonly key: string }
  | {
      readonly reason: 'task-trashed';
      readonly key: string;
      readonly name: string;
      readonly entryId: string;
      readonly rootKey: string;
      readonly trashedAt: Date;
      readonly trashedBy: TaskActor;
      readonly purgeAt: Date;
    }
  | { readonly reason: 'trash-entry-not-found' }
  | { readonly reason: 'trash-entry-not-restorable-yet' }
  | { readonly reason: 'trash-writes-disabled' }
  | { readonly reason: 'version-mismatch'; readonly version: number }
  | { readonly reason: 'status-hidden'; readonly status: StatusKey }
  | { readonly reason: 'cancel-reason-required' }
  | { readonly reason: 'cancel-reason-unexpected' }
  | { readonly reason: 'assignee-invalid'; readonly userIds: readonly string[] }
  | { readonly reason: 'assignee-limit-reached' }
  | { readonly reason: 'label-limit-reached' }
  | { readonly reason: 'checklist-limit-reached' }
  | { readonly reason: 'start-date-invalid' }
  | { readonly reason: 'list-invalid' }
  | { readonly reason: 'parent-invalid'; readonly parentKey: string }
  | { readonly reason: 'subtask-depth-exceeded' }
  | { readonly reason: 'subtask-limit-reached' };
