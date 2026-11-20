import { AssigneeInvalidError } from '../../errors/task/assignee-invalid.error.js';
import { AssigneeLimitReachedError } from '../../errors/task/assignee-limit-reached.error.js';
import { ChecklistItemNotFoundError } from '../../errors/task/checklist-item-not-found.error.js';
import { ChecklistLimitReachedError } from '../../errors/task/checklist-limit-reached.error.js';
import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import { LabelLimitReachedError } from '../../errors/task/label-limit-reached.error.js';
import { TaskArchivedError } from '../../errors/task/task-archived.error.js';
import { TaskInTrashError } from '../../errors/task/task-in-trash.error.js';
import { validateDescriptionMentions } from '../../policies/mention/description-mentions.policy.js';
import { checkAttachment, checkNewSubtask } from '../../policies/subtask/subtask-tree.policy.js';
import { isAssignable, refuseUnassignable } from '../../policies/task/assignability.policy.js';
import {
  normalizeCancelNote,
  resolveCancellation,
} from '../../policies/task/cancellation.policy.js';
import { isScheduleValid, resolveSchedule } from '../../policies/task/schedule.policy.js';
import { checkStatusAvailable } from '../../policies/task/status-availability.policy.js';
import type { AssigneeCandidate } from '../../value-objects/member/assignee-candidate.value-object.js';
import type { DescriptionMention } from '../../value-objects/mention/description-mention.value-object.js';
import type { SubtaskParent } from '../../value-objects/subtask/subtask-parent.value-object.js';
import { CANCEL_REASONS } from '../../value-objects/task/cancel-reason.value-object.js';
import type { ChecklistItemDraft } from '../../value-objects/task/checklist-item-draft.value-object.js';
import type { ChecklistItemState } from '../../value-objects/task/checklist-item-state.value-object.js';
import { labelKey, normalizeLabelName } from '../../value-objects/task/label-name.value-object.js';
import type { NewTask } from '../../value-objects/task/new-task.value-object.js';
import { PRIORITY_KEYS } from '../../value-objects/task/priority-key.value-object.js';
import type { PriorityKey } from '../../value-objects/task/priority-key.value-object.js';
import type { SpaceStatusUse } from '../../value-objects/task/space-status-use.value-object.js';
import { STATUS_KEYS } from '../../value-objects/task/status-key.value-object.js';
import type { StatusKey } from '../../value-objects/task/status-key.value-object.js';
import { ACTOR_TYPES } from '../../value-objects/task/task-actor.value-object.js';
import type { TaskActor } from '../../value-objects/task/task-actor.value-object.js';
import type { TaskArchive } from '../../value-objects/task/task-archive.value-object.js';
import type { TaskDraft } from '../../value-objects/task/task-draft.value-object.js';
import { TASK_FIELDS } from '../../value-objects/task/task-field.value-object.js';
import type { TaskField } from '../../value-objects/task/task-field.value-object.js';
import { TaskKey } from '../../value-objects/task/task-key.value-object.js';
import {
  MAX_ASSIGNEES,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_ESTIMATE_MINUTES,
  MAX_LABELS,
  MAX_NAME_LENGTH,
} from '../../value-objects/task/task-limits.value-object.js';
import type { TaskPatch } from '../../value-objects/task/task-patch.value-object.js';
import type { TaskPlacement } from '../../value-objects/task/task-placement.value-object.js';
import type { TaskState } from '../../value-objects/task/task-state.value-object.js';
import type { TaskTrash } from '../../value-objects/task/task-trash.value-object.js';
import type { TaskUpdate } from '../../value-objects/task/task-update.value-object.js';

/**
 * Function lengthOf
 *
 * @description
 * Length of a text in Unicode code points, the characters `maxLength` of JSON Schema counts, so
 * that an emoji or an accented letter counts once as the contract does.
 *
 * @param {string} text - The text.
 * @returns {number} Its number of characters.
 */
function lengthOf(text: string): number {
  return Array.from(text).length;
}

/**
 * Function requireId
 *
 * @description
 * Refuses an empty id: a task always names its organization, its list, its space and its people.
 *
 * @param {string} id - The id.
 * @returns {string} The same id.
 * @throws {InvalidTaskError} When it is empty.
 */
function requireId(id: string): string {
  if (id === '') {
    throw new InvalidTaskError(
      'the ids of the task, its organization, list, space and people are set',
    );
  }
  return id;
}

/**
 * Function requireInstant
 *
 * @description
 * Refuses an invalid instant: the time of a change comes in as an argument, from the transaction.
 *
 * @param {Date} instant - The instant.
 * @returns {Date} The same instant.
 * @throws {InvalidTaskError} When it is not a valid date.
 */
function requireInstant(instant: Date): Date {
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidTaskError('the instant of a change is a valid date');
  }
  return instant;
}

/**
 * Function checkActor
 *
 * @description
 * `Actor` of `openapi/internal/task-service.yaml:3374-3397`: a known type and a non-empty id.
 *
 * @param {TaskActor} actor - The actor.
 * @returns {TaskActor} The same actor.
 * @throws {InvalidTaskError} When the type is unknown or the id empty.
 */
function checkActor(actor: TaskActor): TaskActor {
  if (!ACTOR_TYPES.includes(actor.type) || actor.id === '') {
    throw new InvalidTaskError('the actor has a known type and an id');
  }
  return actor;
}

/**
 * Function normalizeName
 *
 * @description
 * `TaskName` of `openapi/internal/task-service.yaml:3465-3473`: trimmed, and 1 to 300 characters
 * once trimmed (a name made only of spaces is refused).
 *
 * @param {string} name - The name as typed.
 * @returns {string} The trimmed name.
 * @throws {InvalidTaskError} When the trimmed name is empty or too long.
 */
function normalizeName(name: string): string {
  const trimmed: string = name.trim();
  const length: number = lengthOf(trimmed);
  if (length < 1 || length > MAX_NAME_LENGTH) {
    throw new InvalidTaskError('the name has 1 to 300 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkDescription
 *
 * @description
 * `TaskDescription` of `openapi/internal/task-service.yaml:3474-3485`: Markdown stored as sent, not
 * trimmed (open question 16 of the design), 50,000 characters at most; `null` for none.
 *
 * @param {string | null} description - The description.
 * @returns {string | null} The same description.
 * @throws {InvalidTaskError} When it is longer than 50,000 characters.
 */
function checkDescription(description: string | null): string | null {
  if (description !== null && lengthOf(description) > MAX_DESCRIPTION_LENGTH) {
    throw new InvalidTaskError('the description has at most 50,000 characters');
  }
  return description;
}

/**
 * Function checkPriority
 *
 * @description
 * `PriorityKey` of `openapi/internal/task-service.yaml:3417-3427`.
 *
 * @param {PriorityKey} priority - The priority.
 * @returns {PriorityKey} The same priority.
 * @throws {InvalidTaskError} When it is not one of the four priorities.
 */
function checkPriority(priority: PriorityKey): PriorityKey {
  if (!PRIORITY_KEYS.includes(priority)) {
    throw new InvalidTaskError('the priority is one of the four priorities');
  }
  return priority;
}

/**
 * Function checkEstimate
 *
 * @description
 * `EstimateMinutes` of `openapi/internal/task-service.yaml:3491-3499`: whole minutes from 1 to
 * 60,000; `null` for none.
 *
 * @param {number | null} estimate - The estimate.
 * @returns {number | null} The same estimate.
 * @throws {InvalidTaskError} When it is not an integer from 1 to 60,000.
 */
function checkEstimate(estimate: number | null): number | null {
  if (
    estimate !== null &&
    (!Number.isInteger(estimate) || estimate < 1 || estimate > MAX_ESTIMATE_MINUTES)
  ) {
    throw new InvalidTaskError('the estimate is a whole number of minutes from 1 to 60,000');
  }
  return estimate;
}

/**
 * Function normalizeChecklistText
 *
 * @description
 * `ChecklistItemCreation.text` of `openapi/internal/task-service.yaml:2604-2610`: trimmed, 1 to 300
 * characters once trimmed.
 *
 * @param {string} text - The text as typed.
 * @returns {string} The trimmed text.
 * @throws {InvalidTaskError} When the trimmed text is empty or too long.
 */
function normalizeChecklistText(text: string): string {
  const trimmed: string = text.trim();
  const length: number = lengthOf(trimmed);
  if (length < 1 || length > MAX_CHECKLIST_TEXT_LENGTH) {
    throw new InvalidTaskError('a checklist item has 1 to 300 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function normalizeLabels
 *
 * @description
 * The labels of a creation (`TaskCreation.labels`, `openapi/internal/task-service.yaml:2443-2449`):
 * each trimmed, a label that repeats another without regard to case ignored, the first spelling
 * kept, 20 at most.
 *
 * @param {readonly string[]} labels - The labels as typed.
 * @returns {readonly string[]} The labels to store, in the order sent.
 * @throws {InvalidTaskError} When a label is empty or too long once trimmed, or more than 20
 * remain, which the request bound refuses first.
 */
function normalizeLabels(labels: readonly string[]): readonly string[] {
  const kept: string[] = [];
  const keys: Set<string> = new Set<string>();
  for (const label of labels) {
    const name: string = normalizeLabelName(label);
    const key: string = labelKey(name);
    if (!keys.has(key)) {
      keys.add(key);
      kept.push(name);
    }
  }
  if (kept.length > MAX_LABELS) {
    throw new InvalidTaskError('a task has 20 labels at most');
  }
  return Object.freeze(kept);
}

/**
 * Function distinctAssignees
 *
 * @description
 * The accounts of a creation, each once in the order sent ("the same account twice counts once",
 * `TaskCreation.assigneeIds`, `openapi/internal/task-service.yaml:2419-2428`).
 *
 * @param {readonly AssigneeCandidate[]} candidates - The accounts with their role.
 * @returns {readonly AssigneeCandidate[]} The distinct accounts.
 * @throws {InvalidTaskError} When an account is empty, or more than 20 remain, which the request
 * bound refuses first.
 */
function distinctAssignees(candidates: readonly AssigneeCandidate[]): readonly AssigneeCandidate[] {
  const kept: AssigneeCandidate[] = [];
  for (const candidate of candidates) {
    requireId(candidate.userId);
    if (!kept.some((other: AssigneeCandidate): boolean => other.userId === candidate.userId)) {
      kept.push(candidate);
    }
  }
  if (kept.length > MAX_ASSIGNEES) {
    throw new InvalidTaskError('a task has 20 assignees at most');
  }
  return kept;
}

/**
 * Function checkStoredCollections
 *
 * @description
 * Refuses stored assignees, labels or checklist items no change can produce: more than the
 * limits, an empty or repeated account, a label not normalized or repeated by `labelKey`, an item
 * not trimmed, an id repeated, or positions that do not increase.
 *
 * @param {TaskState} state - The stored state.
 * @throws {InvalidTaskError} When a collection breaks an invariant.
 */
function checkStoredCollections(state: TaskState): void {
  if (
    state.assigneeIds.length > MAX_ASSIGNEES ||
    new Set(state.assigneeIds).size !== state.assigneeIds.length
  ) {
    throw new InvalidTaskError('the assignees are 20 distinct accounts at most');
  }
  state.assigneeIds.forEach(requireId);
  if (
    state.labels.length > MAX_LABELS ||
    state.labels.some((label: string): boolean => normalizeLabelName(label) !== label) ||
    new Set(state.labels.map(labelKey)).size !== state.labels.length
  ) {
    throw new InvalidTaskError('the labels are 20 trimmed labels at most, distinct ignoring case');
  }
  if (state.checklist.length > MAX_CHECKLIST_ITEMS) {
    throw new InvalidTaskError('a checklist holds 100 items at most');
  }
  let previous: number = -1;
  const ids: Set<string> = new Set<string>();
  for (const item of state.checklist) {
    requireId(item.id);
    if (
      normalizeChecklistText(item.text) !== item.text ||
      !Number.isInteger(item.position) ||
      item.position <= previous ||
      ids.has(item.id)
    ) {
      throw new InvalidTaskError('the checklist items are trimmed, distinct and in their order');
    }
    ids.add(item.id);
    previous = item.position;
  }
}

/**
 * Function checkStoredState
 *
 * @description
 * Refuses a stored task no creation or change can produce: the members of `Task` and the links
 * between them (the cancellation, the completion, the dates and the parent).
 *
 * @param {TaskState} state - The stored state.
 * @throws {InvalidTaskError} When the state breaks an invariant, which the message names.
 */
function checkStoredState(state: TaskState): void {
  if (!Number.isInteger(state.version) || state.version < 1) {
    throw new InvalidTaskError('the version is a positive integer');
  }
  [state.id, state.organizationId, state.listId, state.spaceId].forEach(requireId);
  TaskKey.of(state.key.prefix, state.key.number);
  if (normalizeName(state.name) !== state.name) {
    throw new InvalidTaskError('the name is trimmed');
  }
  checkDescription(state.description);
  validateDescriptionMentions(state.description, state.descriptionMentions);
  if (!STATUS_KEYS.includes(state.status)) {
    throw new InvalidTaskError('the status is one of the ten status keys');
  }
  checkPriority(state.priority);
  checkEstimate(state.estimateMinutes);
  checkActor(state.createdBy);
  const cancelled: boolean = state.status === 'cancelled';
  if (
    cancelled !== (state.cancelReason !== null) ||
    (state.cancelReason !== null && !CANCEL_REASONS.includes(state.cancelReason)) ||
    (state.cancelNote !== null &&
      (!cancelled || normalizeCancelNote(state.cancelNote) !== state.cancelNote))
  ) {
    throw new InvalidTaskError('a cancel reason, and a trimmed note, exactly when cancelled');
  }
  if ((state.status === 'done') !== (state.completedAt !== null)) {
    throw new InvalidTaskError('a completion instant exactly when done');
  }
  if (!isScheduleValid(state.dueDate, state.startDate)) {
    throw new InvalidTaskError('a start date only with a due date, on or before it');
  }
  if ((state.parentId === null) !== (state.parentKey === null)) {
    throw new InvalidTaskError('the parent id and the parent key are set together');
  }
  if (state.parentId === state.id || state.parentKey?.equals(state.key) === true) {
    throw new InvalidTaskError('a task is not its own parent');
  }
  checkStoredArchive(state.archive);
  checkStoredTrash(state.trash);
  checkStoredCollections(state);
}

/**
 * Function checkStoredArchive
 *
 * @description
 * Refuses a stored archive no archive can produce ("Tasks" of `openapi/public/archives.yaml`): a
 * valid instant, a known actor and the id of its root; `null` for a live task.
 *
 * @param {TaskArchive | null} archive - The stored archive.
 * @throws {InvalidTaskError} When the instant, the actor or the root is invalid.
 */
function checkStoredArchive(archive: TaskArchive | null): void {
  if (archive === null) {
    return;
  }
  requireInstant(archive.at);
  checkActor(archive.by);
  requireId(archive.rootId);
}

/**
 * Function checkStoredTrash
 *
 * @description
 * Refuses a stored trash no deletion can produce (`openapi/public/trash.yaml`): the id of its
 * entry; `null` for a task that is not in the trash. An archived task in the trash keeps its
 * archive (it went with its subtree or its list, and comes back archived).
 *
 * @param {TaskTrash | null} trash - The stored trash.
 * @throws {InvalidTaskError} When the entry is empty.
 */
function checkStoredTrash(trash: TaskTrash | null): void {
  if (trash !== null) {
    requireId(trash.entryId);
  }
}

/**
 * Class Task
 *
 * @description
 * A task ("Tâche", `Task` of `openapi/internal/task-service.yaml:2135-2259`), with its assignees,
 * labels and checklist, which share its version. Rules (`openapi/public/tasks.yaml:10-60`):
 *
 * - its key never changes (`TaskKey`); its name, description, priority and estimate follow
 *   `TaskCreation` and `TaskPatch`;
 * - any status may follow any other, but a new status the space no longer uses is refused
 *   (`status-availability.policy.ts`); `cancelled` needs a reason and takes a note
 *   (`cancellation.policy.ts`); entering `done` sets `completedAt`, leaving it clears it; the
 *   status of a parent never changes its subtasks;
 * - the start needs the due date and precedes it, and moves with it (`schedule.policy.ts`);
 * - 20 assignees, current members other than guests when they are added
 *   (`assignability.policy.ts`); 20 labels distinct without regard to case; 100 checklist items,
 *   added unticked at the end and only ticked or unticked;
 * - 3 levels and 25 direct subtasks at most, a task always in the list of its parent
 *   (`subtask-tree.policy.ts`);
 * - each change that changes something takes the next version and `updatedAt`, once, whatever
 *   it changes; one that changes nothing keeps the same instance and `changed: []`, so nothing is
 *   written, recorded or emitted (`openapi/public/tasks.yaml:455-456`);
 * - an archived task ("Tasks" of `openapi/public/archives.yaml`) refuses every change and every
 *   new or attached subtask with `TaskArchivedError` (`requireChangeable`), until its archive is
 *   restored; only the removal of a former member from its assignees (`unassign`, a system
 *   change) still applies. `archive` and `unarchive` take the next version and `updatedAt` too;
 * - a task in the trash (`openapi/public/trash.yaml`) refuses every change the same way, with
 *   `TaskInTrashError`, until its entry is restored, but for the removal of a former member;
 *   `trash`, `restoreFromTrash` and `purge` take the next version and `updatedAt` too.
 *
 * Who may see or change the task is decided by the application from its space; the instant of a
 * change comes in as an argument, the transaction instant.
 */
export class Task {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The state of the task; a change returns a new `Task`.
   *
   * @type {TaskState}
   * @readonly
   */
  private readonly state: TaskState;

  /**
   * Property snapshot
   *
   * @description
   * The state to store.
   *
   * @type {TaskState}
   * @readonly
   */
  public get snapshot(): TaskState {
    return this.state;
  }

  /**
   * Property isLive
   *
   * @description
   * Whether the task is live, in no archive and not in the trash ("An archived task is left out
   * of every collection and count", "Tasks" of `openapi/public/archives.yaml`; "A task in the trash
   * is left out of every collection and count", "Entries" of `openapi/public/trash.yaml`): the
   * application decides on it, not on the stored archive or trash.
   *
   * @type {boolean}
   * @readonly
   */
  public get isLive(): boolean {
    return this.state.archive === null && this.state.trash === null;
  }

  /**
   * Property isInTrash
   *
   * @description
   * Whether the task belongs to a trash entry: its key answers `404 task.trashed` or
   * `404 task.not-found` (`TaskNotFound` of `openapi/public/tasks.yaml`).
   *
   * @type {boolean}
   * @readonly
   */
  public get isInTrash(): boolean {
    return this.state.trash !== null;
  }
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a state checked by `restore` or built by a checked change.
   *
   * @param {TaskState} state - The checked state.
   * @constructor
   */
  private constructor(state: TaskState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * Checks and normalizes a new task or subtask (`TaskCreation` and `SubtaskCreation` of
   * `openapi/internal/task-service.yaml:2375-2529`; `openapi/public/tasks.yaml:106-117` and
   * 832-838). The members are normalized first (trimmed name, labels deduplicated without regard to
   * case, assignees deduplicated); then the rules answer, in the order of open question 8 of the
   * design: the parent (`checkNewSubtask`), the status, the cancellation, the dates, the assignees.
   * The draft gets `completedAt` = `now` when it is created `done`. The application then
   * allocates the key, inserts the draft and restores the stored task.
   *
   * @param {NewTask} input - The new task as asked, its list, parent and assignee roles resolved.
   * @param {SpaceStatusUse} statuses - The statuses of the space of the list.
   * @param {Date} now - The transaction instant.
   * @returns {TaskDraft} The task to insert, at version 1.
   * @throws {InvalidTaskError} When a member breaks an invariant the request bounds already
   * refuse, which the message names, or a subtask is not in the list of its parent.
   * @throws {SubtaskDepthExceededError} When the parent is at the third level.
   * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
   * @throws {StatusHiddenError} When the space of the list no longer uses the status.
   * @throws {CancelReasonRequiredError} When the task is created `cancelled` without a reason.
   * @throws {CancelReasonUnexpectedError} When a reason or a note comes with another status.
   * @throws {StartDateInvalidError} When the start is without a due date or after it.
   * @throws {AssigneeInvalidError} With every account that is not a current member other than a
   * guest.
   */
  public static create(input: NewTask, statuses: SpaceStatusUse, now: Date): TaskDraft {
    requireInstant(now);
    const organizationId: string = requireId(input.organizationId);
    const listId: string = requireId(input.placement.listId);
    const spaceId: string = requireId(input.placement.spaceId);
    const createdBy: TaskActor = checkActor(input.createdBy);
    const name: string = normalizeName(input.name);
    const description: string | null = checkDescription(input.description);
    const descriptionMentions = input.descriptionMentions ?? [];
    validateDescriptionMentions(description, descriptionMentions);
    const priority: PriorityKey = checkPriority(input.priority);
    const estimateMinutes: number | null = checkEstimate(input.estimateMinutes);
    const labels: readonly string[] = normalizeLabels(input.labels);
    const assignees: readonly AssigneeCandidate[] = distinctAssignees(input.assignees);

    const { parent } = input;
    if (parent !== null) {
      checkNewSubtask(parent);
      if (parent.listId !== listId || parent.spaceId !== spaceId) {
        throw new InvalidTaskError('a subtask is in the list of its parent');
      }
    }
    checkStatusAvailable(input.status, null, statuses);
    const cancellation: Pick<TaskState, 'cancelReason' | 'cancelNote'> = resolveCancellation(
      null,
      input.status,
      { cancelReason: input.cancelReason, cancelNote: input.cancelNote },
    );
    const schedule: Pick<TaskState, 'dueDate' | 'startDate'> = resolveSchedule(null, {
      dueDate: input.dueDate,
      startDate: input.startDate,
    });
    refuseUnassignable(assignees);

    return {
      organizationId,
      spaceId,
      listId,
      parentId: parent === null ? null : requireId(parent.id),
      parentKey: parent === null ? null : parent.key,
      name,
      description,
      descriptionMentions,
      status: input.status,
      cancelReason: cancellation.cancelReason,
      cancelNote: cancellation.cancelNote,
      priority,
      assigneeIds: Object.freeze(
        assignees.map((candidate: AssigneeCandidate): string => candidate.userId),
      ),
      labels,
      dueDate: schedule.dueDate,
      startDate: schedule.startDate,
      estimateMinutes,
      completedAt: input.status === 'done' ? now : null,
      createdBy,
    };
  }

  /**
   * Method restore
   *
   * @description
   * Rebuilds a stored task, refusing a state no creation or change can produce.
   *
   * @param {TaskState} state - The stored state.
   * @returns {Task} The task.
   * @throws {InvalidTaskError} When the state breaks an invariant, which the message names.
   */
  public static restore(state: TaskState): Task {
    checkStoredState(state);
    return new Task(state);
  }

  /**
   * Method asParent
   *
   * @description
   * This task as the parent of a new or attached subtask (`SubtaskParent`), with what the
   * application read about its tree.
   *
   * @param {number} level - Its level: the number of its ancestors plus one.
   * @param {number} childCount - The number of its live direct subtasks.
   * @returns {SubtaskParent} The parent.
   * @throws {TaskArchivedError} When this task is archived: it takes no subtask.
   */
  public asParent(level: number, childCount: number): SubtaskParent {
    this.requireChangeable();
    return {
      id: this.state.id,
      key: this.state.key,
      listId: this.state.listId,
      spaceId: this.state.spaceId,
      level,
      childCount,
    };
  }

  /**
   * Method update
   *
   * @description
   * Applies a JSON Merge Patch of the task (`TaskPatch` of
   * `openapi/internal/task-service.yaml:2530-2586`; `openapi/public/tasks.yaml:418-456`). Each member
   * present takes its normalized value, then:
   *
   * - placement: `parent` attaches the task to the list of the parent (`checkAttachment`, with
   *   `list`, if any, required to be that list); `parent: null` detaches it and keeps its list;
   *   `list` alone moves it, and a subtask moved to another list leaves its parent first; `list`
   *   equal to the current list moves nothing (open question 19 of the design). The subtasks
   *   follow through `followMove`, which the application calls for each of them;
   * - status: a new status is checked against `statuses`, the space the task is in after the
   *   patch; a move keeps the current status even when that space hides it;
   * - cancellation, completion and dates as the policies say: entering `done` sets `completedAt` =
   *   `now`, `done` to `done` keeps it, leaving clears it; a new due date moves the start.
   *
   * `changed` lists the members whose value differs, in the contract order: leaving `cancelled`
   * names `cancelReason` and, when there was one, `cancelNote`; a shifted start names `startDate`;
   * a move names `listId` and, when they change, `spaceId` and `parentKey`.
   *
   * @param {TaskPatch} patch - The change, `list` and `parent` resolved by the application.
   * @param {SpaceStatusUse} statuses - The statuses of the space the task is in after the patch:
   * the space of `parent`, else of `list`, else the current one.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version and what changed, or this same task and
   * `changed: []` when nothing changes.
   * @throws {InvalidTaskError} When a member breaks an invariant the request bounds already refuse.
   * @throws {ParentInvalidError} When the parent is the task or one of its descendants.
   * @throws {ListInvalidError} When `list` is not the list of `parent`.
   * @throws {SubtaskDepthExceededError} When the task and its subtasks do not fit within 3 levels.
   * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
   * @throws {StatusHiddenError} When the new status is hidden in the space after the patch.
   * @throws {CancelReasonRequiredError} When the task is `cancelled` after the patch without a
   * reason.
   * @throws {CancelReasonUnexpectedError} When a reason or a note comes for a task that is not
   * `cancelled` after the patch.
   * @throws {StartDateInvalidError} When the start is without a due date or after it, or a shift
   * would move it before 0001-01-01.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public update(patch: TaskPatch, statuses: SpaceStatusUse, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const current: TaskState = this.state;
    const name: string = patch.name === undefined ? current.name : normalizeName(patch.name);
    const description: string | null =
      patch.description === undefined ? current.description : checkDescription(patch.description);
    const descriptionMentions: readonly DescriptionMention[] =
      patch.descriptionMentions ??
      (description === current.description ? current.descriptionMentions : []);
    if (patch.descriptionMentions !== undefined) {
      validateDescriptionMentions(description, descriptionMentions);
    }
    const priority: PriorityKey =
      patch.priority === undefined ? current.priority : checkPriority(patch.priority);
    const estimateMinutes: number | null =
      patch.estimateMinutes === undefined
        ? current.estimateMinutes
        : checkEstimate(patch.estimateMinutes);

    const placement: Pick<TaskState, 'listId' | 'spaceId' | 'parentId' | 'parentKey'> =
      this.place(patch);

    const status: StatusKey = patch.status ?? current.status;
    if (patch.status !== undefined) {
      checkStatusAvailable(patch.status, current.status, statuses);
    }
    const cancellation: Pick<TaskState, 'cancelReason' | 'cancelNote'> = resolveCancellation(
      current,
      status,
      patch,
    );
    const schedule: Pick<TaskState, 'dueDate' | 'startDate'> = resolveSchedule(current, patch);
    let completedAt: Date | null = null;
    if (status === 'done') {
      completedAt = current.status === 'done' ? current.completedAt : now;
    }

    const changed: Set<TaskField> = new Set<TaskField>();
    const mark = (field: TaskField, differs: boolean): void => {
      if (differs) {
        changed.add(field);
      }
    };
    mark('name', name !== current.name);
    mark('description', description !== current.description);
    mark(
      'descriptionMentions',
      descriptionMentions.length !== current.descriptionMentions.length ||
        descriptionMentions.some((span, index) => {
          const stored = current.descriptionMentions[index];
          return (
            stored?.userId !== span.userId || stored.start !== span.start || stored.end !== span.end
          );
        }),
    );
    mark('status', status !== current.status);
    mark('cancelReason', cancellation.cancelReason !== current.cancelReason);
    mark('cancelNote', cancellation.cancelNote !== current.cancelNote);
    mark('priority', priority !== current.priority);
    mark('dueDate', schedule.dueDate !== current.dueDate);
    mark('startDate', schedule.startDate !== current.startDate);
    mark('estimateMinutes', estimateMinutes !== current.estimateMinutes);
    mark('listId', placement.listId !== current.listId);
    mark('spaceId', placement.spaceId !== current.spaceId);
    mark('parentKey', placement.parentId !== current.parentId);
    return this.next(
      {
        name,
        description,
        descriptionMentions,
        status,
        ...cancellation,
        priority,
        ...schedule,
        estimateMinutes,
        ...placement,
        completedAt,
      },
      changed,
      now,
    );
  }

  /**
   * Method followMove
   *
   * @description
   * Moves a subtask with the task above it that moved or attached to another list ("a task that
   * moves takes its subtasks with it", `openapi/public/tasks.yaml:30-33` and 434-438): it keeps its
   * parent and its status, even one the new space no longer uses (`openapi/public/tasks.yaml:445-447`),
   * and emits its own `task.updated.v1` (`asyncapi/task-service.yaml:28-30`).
   *
   * @param {TaskPlacement} placement - The new list of the moved tree and its space.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The subtask at the next version with `listId` and, when it changes,
   * `spaceId`, or this same subtask and `changed: []` when it is already there.
   * @throws {InvalidTaskError} When an id is empty or the instant invalid.
   * @throws {TaskArchivedError} When the subtask is archived: an archived subtask stays where it
   * is when the task above it moves.
   */
  public followMove(placement: TaskPlacement, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const listId: string = requireId(placement.listId);
    const spaceId: string = requireId(placement.spaceId);
    const changed: Set<TaskField> = new Set<TaskField>();
    if (listId !== this.state.listId) {
      changed.add('listId');
    }
    if (spaceId !== this.state.spaceId) {
      changed.add('spaceId');
    }
    return this.next({ listId, spaceId }, changed, now);
  }

  /**
   * Method assign
   *
   * @description
   * Adds a person to the assignees, after the others (`PUT …/assignees/{userId}`,
   * `openapi/public/tasks.yaml:1039-1043`), in this order: a person already assigned changes
   * nothing, checked first, so an assignee who has become a guest since stays; then the person is a
   * current member other than a guest (`isAssignable`); then a task has 20 assignees at most.
   *
   * @param {AssigneeCandidate} candidate - The account with its role in the copy.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['assigneeIds']`, or this same
   * task and `changed: []` when the person is already assigned.
   * @throws {InvalidTaskError} When the account is empty or the instant invalid.
   * @throws {AssigneeInvalidError} When the account may not be assigned, with that account.
   * @throws {AssigneeLimitReachedError} When the task already has 20 assignees.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public assign(candidate: AssigneeCandidate, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const userId: string = requireId(candidate.userId);
    const { assigneeIds } = this.state;
    if (assigneeIds.includes(userId)) {
      return { task: this, changed: [] };
    }
    if (!isAssignable(candidate.role)) {
      throw new AssigneeInvalidError([userId]);
    }
    if (assigneeIds.length >= MAX_ASSIGNEES) {
      throw new AssigneeLimitReachedError();
    }
    return this.next(
      { assigneeIds: Object.freeze([...assigneeIds, userId]) },
      new Set<TaskField>(['assigneeIds']),
      now,
    );
  }

  /**
   * Method unassign
   *
   * @description
   * Removes a person from the assignees (`DELETE …/assignees/{userId}`,
   * `openapi/public/tasks.yaml:1093-1101`), also when a removed member leaves every task
   * (`openapi/internal/task-service.yaml:66-69`). The others keep their order. It applies to an
   * archived task too: the removal of a former member is a change of task-service itself, not of
   * a user, and leaves every task; the route of a user refuses an archived task before it comes
   * here.
   *
   * @param {string} userId - The account.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['assigneeIds']`, or this same
   * task and `changed: []` when the person is not assigned.
   * @throws {InvalidTaskError} When the account is empty or the instant invalid.
   */
  public unassign(userId: string, now: Date): TaskUpdate {
    requireInstant(now);
    requireId(userId);
    const { assigneeIds } = this.state;
    if (!assigneeIds.includes(userId)) {
      return { task: this, changed: [] };
    }
    return this.next(
      { assigneeIds: Object.freeze(assigneeIds.filter((id: string): boolean => id !== userId)) },
      new Set<TaskField>(['assigneeIds']),
      now,
    );
  }

  /**
   * Method addLabel
   *
   * @description
   * Adds a label after the others (`openapi/public/tasks.yaml:1138-1140`): trimmed, kept in this
   * spelling; one that repeats a label of the task without regard to case (`labelKey`) changes
   * nothing, checked before the limit of 20.
   *
   * @param {string} name - The label as typed.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['labels']`, or this same task
   * and `changed: []` when it has the label already.
   * @throws {InvalidTaskError} When the label is empty or longer than 32 characters once trimmed.
   * @throws {LabelLimitReachedError} When the task already has 20 labels.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public addLabel(name: string, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const label: string = normalizeLabelName(name);
    const key: string = labelKey(label);
    const { labels } = this.state;
    if (labels.some((existing: string): boolean => labelKey(existing) === key)) {
      return { task: this, changed: [] };
    }
    if (labels.length >= MAX_LABELS) {
      throw new LabelLimitReachedError();
    }
    return this.next(
      { labels: Object.freeze([...labels, label]) },
      new Set<TaskField>(['labels']),
      now,
    );
  }

  /**
   * Method removeLabel
   *
   * @description
   * Removes a label without regard to case (`openapi/public/tasks.yaml:1198-1199`), compared by
   * `labelKey`; the others keep their order.
   *
   * @param {string} name - The label as typed.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['labels']`, or this same task
   * and `changed: []` when it does not have the label.
   * @throws {InvalidTaskError} When the label is empty or longer than 32 characters once trimmed.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public removeLabel(name: string, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const key: string = labelKey(normalizeLabelName(name));
    const { labels } = this.state;
    const kept: readonly string[] = labels.filter(
      (label: string): boolean => labelKey(label) !== key,
    );
    if (kept.length === labels.length) {
      return { task: this, changed: [] };
    }
    return this.next({ labels: Object.freeze(kept) }, new Set<TaskField>(['labels']), now);
  }

  /**
   * Method draftChecklistItem
   *
   * @description
   * Checks a new checklist item before it is inserted (`openapi/public/tasks.yaml:924-925`): the
   * text trimmed, not ticked, after every existing item, and refused when the checklist holds 100
   * items. The task does not change: the application inserts the draft, which PostgreSQL gives an
   * id, then calls `addChecklistItem` with the stored item.
   *
   * @param {string} text - The text as typed.
   * @returns {ChecklistItemDraft} The item to insert.
   * @throws {InvalidTaskError} When the text is empty or longer than 300 characters once trimmed.
   * @throws {ChecklistLimitReachedError} When the checklist already holds 100 items.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public draftChecklistItem(text: string): ChecklistItemDraft {
    this.requireChangeable();
    const normalized: string = normalizeChecklistText(text);
    const { checklist } = this.state;
    if (checklist.length >= MAX_CHECKLIST_ITEMS) {
      throw new ChecklistLimitReachedError();
    }
    const last: ChecklistItemState | undefined = checklist.at(-1);
    return { text: normalized, done: false, position: last === undefined ? 0 : last.position + 1 };
  }

  /**
   * Method addChecklistItem
   *
   * @description
   * Appends an item that `draftChecklistItem` checked and the repository inserted
   * (`openapi/public/tasks.yaml:924-927`): a new version even though the item row is already
   * written, since the checklist shares the version of the task. Never a no-op.
   *
   * @param {ChecklistItemState} item - The inserted item, with its id.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['checklist']`.
   * @throws {InvalidTaskError} When the item is not a draft of this checklist: an empty or known
   * id, a text not normalized, ticked, or not after the last item.
   * @throws {ChecklistLimitReachedError} When the checklist already holds 100 items.
   * @throws {TaskArchivedError} When the task is archived.
   */
  public addChecklistItem(item: ChecklistItemState, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    requireId(item.id);
    const { checklist } = this.state;
    if (checklist.length >= MAX_CHECKLIST_ITEMS) {
      throw new ChecklistLimitReachedError();
    }
    const last: ChecklistItemState | undefined = checklist.at(-1);
    if (
      item.done ||
      normalizeChecklistText(item.text) !== item.text ||
      !Number.isInteger(item.position) ||
      item.position <= (last === undefined ? -1 : last.position) ||
      checklist.some((existing: ChecklistItemState): boolean => existing.id === item.id)
    ) {
      throw new InvalidTaskError('a new checklist item is unticked, trimmed and after the others');
    }
    return this.next(
      { checklist: Object.freeze([...checklist, Object.freeze({ ...item })]) },
      new Set<TaskField>(['checklist']),
      now,
    );
  }

  /**
   * Method setChecklistItemDone
   *
   * @description
   * Ticks ("Terminer") or unticks ("Rouvrir") an item (`openapi/public/tasks.yaml:983-987`;
   * `openapi/internal/task-service.yaml:1038-1041`); the same state changes nothing.
   *
   * @param {string} checklistItemId - The id of the item.
   * @param {boolean} done - `true` to tick it, `false` to untick it.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task at the next version with `changed: ['checklist']`, or this same
   * task and `changed: []` when the item already has that state.
   * @throws {InvalidTaskError} When the instant is invalid.
   * @throws {ChecklistItemNotFoundError} When the checklist has no item with this id.
   * @throws {TaskArchivedError} When the task is archived, checked before the item.
   */
  public setChecklistItemDone(checklistItemId: string, done: boolean, now: Date): TaskUpdate {
    this.requireChangeable();
    requireInstant(now);
    const { checklist } = this.state;
    const item: ChecklistItemState | undefined = checklist.find(
      (existing: ChecklistItemState): boolean => existing.id === checklistItemId,
    );
    if (item === undefined) {
      throw new ChecklistItemNotFoundError(checklistItemId);
    }
    if (item.done === done) {
      return { task: this, changed: [] };
    }
    return this.next(
      {
        checklist: Object.freeze(
          checklist.map((existing: ChecklistItemState): ChecklistItemState =>
            existing === item ? Object.freeze({ ...existing, done }) : existing,
          ),
        ),
      },
      new Set<TaskField>(['checklist']),
      now,
    );
  }

  /**
   * Advances the task version for a committed comment creation (P3b-2 decision 24).
   *
   * @param at - Transaction instant.
   * @returns The task at its next version.
   * @throws {TaskArchivedError} When the task is archived.
   * @throws {TaskInTrashError} When the task is in the trash.
   * @throws {InvalidTaskError} When the instant is invalid.
   */
  public withCommentChange(at: Date): Task {
    return this.withCollaborationChange(at);
  }

  /** Advances the version when the task's explicit watcher override changes. */
  public withWatcherChange(at: Date): Task {
    return this.withCollaborationChange(at);
  }

  /** Advances the task version for a write to a separately stored collaboration resource. */
  private withCollaborationChange(at: Date): Task {
    this.requireChangeable();
    requireInstant(at);
    return new Task({ ...this.state, updatedAt: at, version: this.state.version + 1 });
  }

  /**
   * Method requireChangeable
   *
   * @description
   * Refuses a change of an archived task ("An archived task ... refuses every change with
   * `409 task.archived`", "Tasks" of `openapi/public/archives.yaml`): the task itself, a new
   * subtask under it, an attachment to it. The application calls it after the visibility and the
   * role, before `If-Match`; the methods that change the task call it too. A task in the trash,
   * archived or not, refuses them first; the application answers it `404` before it gets here.
   *
   * @throws {TaskInTrashError} With the key of the task, when it is in the trash.
   * @throws {TaskArchivedError} With the key of the task, when it is archived.
   */
  public requireChangeable(): void {
    if (this.state.trash !== null) {
      throw new TaskInTrashError(this.state.key.format());
    }
    if (this.state.archive !== null) {
      throw new TaskArchivedError(this.state.key.format());
    }
  }

  /**
   * Method archive
   *
   * @description
   * Puts the task in an archive ("Archiving a task archives its subtree, its subtasks at every
   * level, whatever their status", "Tasks" of `openapi/public/archives.yaml`): the root and each of
   * its live descendants take the same instant, actor and root, the next version and `updatedAt`
   * = `at` (`version` of `Task`: "an archive and a restoration included"). Nothing else changes:
   * the status, the list and the parent stay. An archive is not recorded in the activity log.
   *
   * @param {string} rootId - The id of the root of the archive: this task's own id for the root.
   * @param {TaskActor} by - Who archives it.
   * @param {Date} at - The transaction instant.
   * @returns {Task} The task, archived, at the next version.
   * @throws {InvalidTaskError} When the task is archived already or in the trash, the instant or
   * the actor is invalid, the root is empty, or a task archived from another root has no parent.
   */
  public archive(rootId: string, by: TaskActor, at: Date): Task {
    requireInstant(at);
    checkActor(by);
    requireId(rootId);
    const { state } = this;
    if (state.archive !== null) {
      throw new InvalidTaskError('an archived task is not archived again');
    }
    if (state.trash !== null) {
      throw new InvalidTaskError('a task in the trash is not archived');
    }
    if (rootId !== state.id && state.parentId === null) {
      throw new InvalidTaskError('a task archived with another root is one of its subtasks');
    }
    return new Task({
      ...state,
      archive: Object.freeze({ at, by: Object.freeze({ type: by.type, id: by.id }), rootId }),
      updatedAt: at,
      version: state.version + 1,
    });
  }

  /**
   * Method unarchive
   *
   * @description
   * Brings the task back from its archive ("Restoring any task of an archive restores the whole
   * archive, from its root, to its list", "Tasks" of `openapi/public/archives.yaml`): the archive
   * cleared, the next version and `updatedAt` = `at`. The root leaves its parent when the parent
   * can no longer take it (`detach`, decided by `takesRestoredRoot`) and becomes a top-level task of
   * its list; every other member keeps its parent, a member of the same archive.
   *
   * @param {Date} at - The transaction instant.
   * @param {boolean} detach - `true` to detach the root from its parent.
   * @returns {Task} The task, live, at the next version.
   * @throws {InvalidTaskError} When the task is live or in the trash, the instant invalid, or
   * `detach` names a task that is not the root of its archive or has no parent.
   */
  public unarchive(at: Date, detach: boolean): Task {
    requireInstant(at);
    const { state } = this;
    if (state.archive === null) {
      throw new InvalidTaskError('a live task is not restored');
    }
    if (state.trash !== null) {
      throw new InvalidTaskError('an archive in the trash is not restored from the archives');
    }
    if (detach && (state.archive.rootId !== state.id || state.parentId === null)) {
      throw new InvalidTaskError('only the root of an archive leaves its parent');
    }
    return new Task({
      ...state,
      archive: null,
      parentId: detach ? null : state.parentId,
      parentKey: detach ? null : state.parentKey,
      updatedAt: at,
      version: state.version + 1,
    });
  }

  /**
   * Method trash
   *
   * @description
   * Puts the task in a trash entry ("deleting a task moves it and its subtasks at every level to
   * the trash as one entry", "Entries" of `openapi/public/trash.yaml`): the root and each task taken
   * with it get the entry, the next version and `updatedAt` = `at` (`task.trashed.v1`: "Version of
   * the task after the move"). The entry holds the root and every descendant of it in its list
   * that is not in the trash already, live and archived ("an archived task that goes with its list
   * leaves the archives", `task.trashed.v1`): an archived task keeps its archive while in the
   * trash, which leaves it out of the archives, and comes back in it. Nothing else changes: the
   * status, the list, the parent, the archive and the collections stay, so the restoration gives
   * the task back as it was, and the archived subtasks never count among the 25 of a parent. The
   * trash is not recorded in the activity log.
   *
   * @param {string} entryId - The id of the trash entry.
   * @param {Date} at - The transaction instant, the `trashedAt` of the entry.
   * @returns {Task} The task, in the trash, at the next version.
   * @throws {InvalidTaskError} When the task is in the trash already, the entry is empty or the
   * instant invalid.
   */
  public trash(entryId: string, at: Date): Task {
    requireInstant(at);
    requireId(entryId);
    const { state } = this;
    if (state.trash !== null) {
      throw new InvalidTaskError('a task in the trash is not trashed again');
    }
    return new Task({
      ...state,
      trash: Object.freeze({ entryId }),
      updatedAt: at,
      version: state.version + 1,
    });
  }

  /**
   * Method restoreFromTrash
   *
   * @description
   * Brings the task back from its trash entry ("An entry comes back to its list", "Restoring" of
   * `openapi/public/trash.yaml`): the entry cleared, the next version and `updatedAt` = `at`
   * (`task.restored.v1`). The root leaves its parent when the parent can no longer take it
   * (`detach`: for a live root, a parent no longer live or that `takesRestoredRoot` refuses,
   * "détachée de son parent supprimé"; for an archived root, a parent in the trash or in another
   * list, which it could not show) and becomes a top-level task of its list; every other task of
   * the entry keeps its parent, a task of the same entry. An archived task comes back in its
   * archive, detached or not.
   *
   * @param {Date} at - The transaction instant.
   * @param {boolean} detach - `true` to detach the root from its parent; the application passes it
   * for the root of the entry only.
   * @returns {Task} The task, out of the trash, at the next version, with its archive as it was.
   * @throws {InvalidTaskError} When the task is not in the trash, the instant is invalid, or
   * `detach` names a task without parent.
   */
  public restoreFromTrash(at: Date, detach: boolean): Task {
    requireInstant(at);
    const { state } = this;
    if (state.trash === null) {
      throw new InvalidTaskError('a task that is not in the trash is not restored from it');
    }
    if (detach && state.parentId === null) {
      throw new InvalidTaskError('only a task with a parent leaves it');
    }

    return new Task({
      ...state,
      trash: null,
      parentId: detach ? null : state.parentId,
      parentKey: detach ? null : state.parentKey,
      updatedAt: at,
      version: state.version + 1,
    });
  }

  /**
   * Method rearchive
   *
   * @description
   * Archives again, as of its restoration from the trash, a task that came back archived ("an
   * archived task restored from the trash comes back archived as of the restoration, by the person
   * who restored it"): the same root of its archive (an archive lies wholly inside an entry, so
   * every member of it changes together), the instant and the actor of the restoration, the next
   * version and `updatedAt` = `at` (`task.archived.v1`, whose `occurredAt` is its new
   * `archivedAt`). Nothing else changes.
   *
   * @param {TaskActor} by - Who restored it.
   * @param {Date} at - The transaction instant of the restoration.
   * @returns {Task} The task, archived as of the restoration, at the next version.
   * @throws {InvalidTaskError} When the task is not archived or still in the trash, or the instant
   * or the actor is invalid.
   */
  public rearchive(by: TaskActor, at: Date): Task {
    requireInstant(at);
    checkActor(by);
    const { state } = this;
    if (state.archive === null) {
      throw new InvalidTaskError('only an archived task is archived again');
    }
    if (state.trash !== null) {
      throw new InvalidTaskError('a task in the trash is not archived');
    }
    return new Task({
      ...state,
      archive: Object.freeze({
        at,
        by: Object.freeze({ type: by.type, id: by.id }),
        rootId: state.archive.rootId,
      }),
      updatedAt: at,
      version: state.version + 1,
    });
  }

  /**
   * Method purge
   *
   * @description
   * The task as it is erased for good ("Erasing" of `openapi/public/trash.yaml`): only a task in
   * the trash is erased, and its erasure is one more version (`task.purged.v1`: "Version of the
   * task with its erasure"), with `updatedAt` = `at`. The application deletes the row and emits
   * this state; nothing of it is stored.
   *
   * @param {Date} at - The transaction instant.
   * @returns {Task} The task at the version of its erasure.
   * @throws {InvalidTaskError} When the task is not in the trash or the instant is invalid.
   */
  public purge(at: Date): Task {
    requireInstant(at);
    const { state } = this;
    if (state.trash === null) {
      throw new InvalidTaskError('only a task in the trash is erased');
    }
    return new Task({ ...state, updatedAt: at, version: state.version + 1 });
  }

  /**
   * Method place
   *
   * @description
   * Where the task is after a patch, from its resolved `list` and `parent` members (see `update`).
   *
   * @param {TaskPatch} patch - The change.
   * @returns {Pick<TaskState, 'listId' | 'spaceId' | 'parentId' | 'parentKey'>} The placement.
   * @throws {InvalidTaskError} When an id is empty or the subtree is not the one of this task.
   * @throws {ParentInvalidError} When the parent is the task or one of its descendants.
   * @throws {ListInvalidError} When `list` is not the list of `parent`.
   * @throws {SubtaskDepthExceededError} When the task and its subtasks do not fit within 3 levels.
   * @throws {SubtaskLimitReachedError} When the parent already has 25 direct subtasks.
   */
  private place(
    patch: TaskPatch,
  ): Pick<TaskState, 'listId' | 'spaceId' | 'parentId' | 'parentKey'> {
    const current: TaskState = this.state;
    const { list, parent: attachment } = patch;
    if (list !== undefined) {
      requireId(list.listId);
      requireId(list.spaceId);
    }
    if (attachment !== undefined && attachment !== null) {
      if (attachment.subtree.taskId !== current.id) {
        throw new InvalidTaskError('the subtree of an attachment is the one of the task');
      }
      const { parent } = attachment;
      requireId(parent.id);
      requireId(parent.listId);
      requireId(parent.spaceId);
      checkAttachment(current.key, current.parentId, attachment, list?.listId);
      return {
        listId: parent.listId,
        spaceId: parent.spaceId,
        parentId: parent.id,
        parentKey: parent.key,
      };
    }
    const moves: boolean = list !== undefined && list.listId !== current.listId;
    const detaches: boolean = attachment === null || moves;
    return {
      listId: moves && list !== undefined ? list.listId : current.listId,
      spaceId: moves && list !== undefined ? list.spaceId : current.spaceId,
      parentId: detaches ? null : current.parentId,
      parentKey: detaches ? null : current.parentKey,
    };
  }

  /**
   * Method next
   *
   * @description
   * The task after a change: when something changed, the members replaced, `updatedAt` = `now`
   * and one more version, once per committed change (`openapi/internal/task-service.yaml:2250-2259`);
   * otherwise this same task.
   *
   * @param {Partial<TaskState>} members - The members after the change.
   * @param {ReadonlySet<TaskField>} changed - The members whose value differs.
   * @param {Date} now - The transaction instant.
   * @returns {TaskUpdate} The task and `changed` in the contract order.
   */
  private next(
    members: Partial<TaskState>,
    changed: ReadonlySet<TaskField>,
    now: Date,
  ): TaskUpdate {
    if (changed.size === 0) {
      return { task: this, changed: [] };
    }
    return {
      task: new Task({
        ...this.state,
        ...members,
        updatedAt: now,
        version: this.state.version + 1,
      }),
      changed: Object.freeze(TASK_FIELDS.filter((field: TaskField): boolean => changed.has(field))),
    };
  }
  // #endregion
}
