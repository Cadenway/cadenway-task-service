import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { ActivityChange } from '../../value-objects/activity/activity-change.value-object.js';
import type { ActivityEntryDraft } from '../../value-objects/activity/activity-entry-draft.value-object.js';
import type { ActivityEntryState } from '../../value-objects/activity/activity-entry-state.value-object.js';
import { ACTIVITY_KINDS } from '../../value-objects/activity/activity-kind.value-object.js';
import { CalendarDate } from '../../value-objects/task/calendar-date.value-object.js';
import { PRIORITY_KEYS } from '../../value-objects/task/priority-key.value-object.js';
import { STATUS_KEYS } from '../../value-objects/task/status-key.value-object.js';
import {
  ACTOR_TYPES,
  GIT_ACTOR_PROVIDERS,
} from '../../value-objects/task/task-actor.value-object.js';
import type { TaskActor } from '../../value-objects/task/task-actor.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';

/**
 * Function invalid
 *
 * @description
 * The error of an entry that breaks an invariant.
 *
 * @param {string} invariant - Which invariant, without any value.
 * @returns {InvalidTaskError} The error to throw.
 */
function invalid(invariant: string): InvalidTaskError {
  return new InvalidTaskError(`activity entry: ${invariant}`);
}

/**
 * Function isDate
 *
 * @description
 * Whether a due date of an entry is a calendar date or none.
 *
 * @param {string | null} date - The date.
 * @returns {boolean} Whether it is valid.
 */
function isDate(date: string | null): boolean {
  return date === null || CalendarDate.isCalendarDate(date);
}

/**
 * Function checkChange
 *
 * @description
 * Refuses a change no entry records (`ActivityEntry`, `openapi/internal/task-service.yaml:2645-2721`):
 * an unknown kind, an unknown status or priority, a `from` equal to its `to` (no change, or a merge
 * back to the original value, which deletes the entry), a due date that is not a calendar date, or
 * an assignment without an account.
 *
 * @param {ActivityChange} change - The change.
 * @throws {InvalidTaskError} When the change breaks an invariant.
 */
function checkChange(change: ActivityChange): void {
  if (!ACTIVITY_KINDS.includes(change.kind)) {
    throw invalid('the kind is one of the five kinds');
  }
  switch (change.kind) {
    case 'create':
      return;
    case 'comment':
      if (change.commentId === '' || Array.from(change.commentExcerpt).length > 240) {
        throw invalid('a comment entry has an id and an excerpt of at most 240 code points');
      }
      return;
    case 'status':
      if (
        !STATUS_KEYS.includes(change.status.from) ||
        !STATUS_KEYS.includes(change.status.to) ||
        change.status.from === change.status.to
      ) {
        throw invalid('a status entry names two different statuses');
      }
      return;
    case 'priority':
      if (
        !PRIORITY_KEYS.includes(change.priority.from) ||
        !PRIORITY_KEYS.includes(change.priority.to) ||
        change.priority.from === change.priority.to
      ) {
        throw invalid('a priority entry names two different priorities');
      }
      return;
    case 'due':
      if (
        !isDate(change.dueDate.from) ||
        !isDate(change.dueDate.to) ||
        change.dueDate.from === change.dueDate.to
      ) {
        throw invalid('a due entry names two different dates, at most one of them none');
      }
      return;
    case 'assign':
      if (change.assignee.userId === '') {
        throw invalid('an assign entry names an account');
      }
      return;
  }
}

/**
 * Function checkDraft
 *
 * @description
 * Refuses an entry without its ids, with an unknown actor, an invalid instant or an invalid change.
 *
 * @param {ActivityEntryDraft} draft - The entry.
 * @throws {InvalidTaskError} When the entry breaks an invariant.
 */
function checkDraft(draft: ActivityEntryDraft): void {
  if (draft.organizationId === '' || draft.taskId === '' || draft.listId === '') {
    throw invalid('the ids of the organization, the task and the list are set');
  }
  if (!ACTOR_TYPES.includes(draft.actor.type) || draft.actor.id === '') {
    throw invalid('the actor has a known type and an id');
  }
  if (
    draft.actor.provider !== undefined &&
    (draft.actor.type !== 'git' || !GIT_ACTOR_PROVIDERS.includes(draft.actor.provider))
  ) {
    throw invalid('only a Git actor can name a known Git provider');
  }
  if (Number.isNaN(draft.occurredAt.getTime())) {
    throw invalid('the instant is a valid date');
  }
  if (
    draft.initialStatus !== undefined &&
    (draft.change.kind !== 'create' || !STATUS_KEYS.includes(draft.initialStatus))
  ) {
    throw invalid('only a creation entry can name a known initial status');
  }
  checkChange(draft.change);
}

/**
 * Class ActivityEntry
 *
 * @description
 * One entry of the activity log of a task ("Activité", `ActivityEntry` of
 * `openapi/internal/task-service.yaml:2622-2721`; `openapi/public/tasks.yaml:45-49`). task-service
 * records the creation of a task and the changes of its status, priority, due date and assignees,
 * with who made them; never the name, the description, the labels, the estimate, the list, the
 * parent or the checklist. Each entry names the list the task was in when the change was made,
 * the list after the change (open question 3 of the design). The merge of close changes of the
 * priority or the due date is `activity-coalescing.policy.ts`.
 */
export class ActivityEntry {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The state of the entry.
   *
   * @type {ActivityEntryState}
   * @readonly
   */
  private readonly state: ActivityEntryState;

  /**
   * Property snapshot
   *
   * @description
   * The state as stored.
   *
   * @type {ActivityEntryState}
   * @readonly
   */
  public get snapshot(): ActivityEntryState {
    return this.state;
  }
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a state checked by `restore`.
   *
   * @param {ActivityEntryState} state - The checked state.
   * @constructor
   */
  private constructor(state: ActivityEntryState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method restore
   *
   * @description
   * Rebuilds a stored entry, refusing a state no recording or merge can produce.
   *
   * @param {ActivityEntryState} state - The stored state.
   * @returns {ActivityEntry} The entry.
   * @throws {InvalidTaskError} When the id is empty or the entry breaks an invariant.
   */
  public static restore(state: ActivityEntryState): ActivityEntry {
    if (state.id === '') {
      throw invalid('the id is set');
    }
    checkDraft(state);
    return new ActivityEntry(state);
  }

  /**
   * Method forCreation
   *
   * @description
   * The `create` entry of a task just created, the task and each subtask of a creation, or a
   * subtask created alone (`openapi/public/tasks.yaml:119-120` and 838). The initial assignees get
   * no `assign` entry (`openapi/internal/task-service.yaml:520-521`). The initial status is kept
   * for the elapsed-time history (`getTaskStatusDurationsInternal`).
   *
   * @param {TaskState} task - The stored task.
   * @param {TaskActor} actor - Who created it.
   * @param {Date} occurredAt - The transaction instant.
   * @returns {ActivityEntryDraft} The entry to insert.
   * @throws {InvalidTaskError} When an id is empty, the actor unknown or the instant invalid.
   */
  public static forCreation(
    task: TaskState,
    actor: TaskActor,
    occurredAt: Date,
  ): ActivityEntryDraft {
    const draft: ActivityEntryDraft = {
      organizationId: task.organizationId,
      taskId: task.id,
      listId: task.listId,
      actor,
      occurredAt,
      change: { kind: 'create' },
      initialStatus: task.status,
    };
    checkDraft(draft);
    return draft;
  }

  /**
   * Drafts the activity entry of a newly posted comment (P3b-2 decision 24).
   *
   * @param task - The task after its version advances.
   * @param actor - The person who posted.
   * @param occurredAt - Transaction instant.
   * @param commentId - Database-assigned comment ID.
   * @param commentExcerpt - At most 240 Unicode code points of Markdown.
   * @returns The validated entry.
   * @throws {InvalidTaskError} When a value breaks an activity invariant.
   */
  public static forComment(
    task: TaskState,
    actor: TaskActor,
    occurredAt: Date,
    commentId: string,
    commentExcerpt: string,
  ): ActivityEntryDraft {
    const draft: ActivityEntryDraft = {
      organizationId: task.organizationId,
      taskId: task.id,
      listId: task.listId,
      actor,
      occurredAt,
      change: { kind: 'comment', commentId, commentExcerpt },
    };
    checkDraft(draft);
    return draft;
  }

  /**
   * Method forChange
   *
   * @description
   * The entries a committed change of a task records (`openapi/public/tasks.yaml:45-49`, 452 and
   * 1045-1046; `openapi/internal/task-service.yaml:66-69`), in this order: `status` when the status
   * changed, `priority` when the priority changed, `due` when the due date was set, moved or
   * removed (a start that moves records nothing more), then one `assign` per account added
   * (`added: true`) and one per account removed (`added: false`), in the order of the assignees.
   * Nothing else is recorded, so a change of the name, the labels or the list alone gives no entry.
   * The `priority` and `due` entries then go through `coalesceActivity`.
   *
   * @param {TaskState} before - The task before the change.
   * @param {TaskState} after - The task after the change.
   * @param {TaskActor} actor - Who made the change: a person, or task-service for a removed member.
   * @param {Date} occurredAt - The transaction instant.
   * @returns {readonly ActivityEntryDraft[]} The entries to record, possibly none.
   * @throws {InvalidTaskError} When the two states are not of the same task, an id is empty, the
   * actor unknown or the instant invalid.
   */
  public static forChange(
    before: TaskState,
    after: TaskState,
    actor: TaskActor,
    occurredAt: Date,
  ): readonly ActivityEntryDraft[] {
    if (before.id !== after.id || before.organizationId !== after.organizationId) {
      throw invalid('a change compares two states of the same task');
    }
    const changes: ActivityChange[] = [];
    if (before.status !== after.status) {
      changes.push({ kind: 'status', status: { from: before.status, to: after.status } });
    }
    if (before.priority !== after.priority) {
      changes.push({ kind: 'priority', priority: { from: before.priority, to: after.priority } });
    }
    if (before.dueDate !== after.dueDate) {
      changes.push({ kind: 'due', dueDate: { from: before.dueDate, to: after.dueDate } });
    }
    for (const userId of after.assigneeIds) {
      if (!before.assigneeIds.includes(userId)) {
        changes.push({ kind: 'assign', assignee: { userId, added: true } });
      }
    }
    for (const userId of before.assigneeIds) {
      if (!after.assigneeIds.includes(userId)) {
        changes.push({ kind: 'assign', assignee: { userId, added: false } });
      }
    }
    const drafts: readonly ActivityEntryDraft[] = changes.map(
      (change: ActivityChange): ActivityEntryDraft => ({
        organizationId: after.organizationId,
        taskId: after.id,
        listId: after.listId,
        actor,
        occurredAt,
        change,
      }),
    );
    drafts.forEach(checkDraft);
    return Object.freeze(drafts);
  }
  // #endregion
}
