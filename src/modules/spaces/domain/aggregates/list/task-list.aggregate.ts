import { InvalidListError } from '../../errors/list/invalid-list.error.js';
import { SprintDatesInvalidError } from '../../errors/list/sprint-dates-invalid.error.js';
import { LIST_ACTOR_TYPES } from '../../value-objects/list/list-actor.value-object.js';
import type { ListActor } from '../../value-objects/list/list-actor.value-object.js';
import type { NewTaskList } from '../../value-objects/list/new-task-list.value-object.js';
import type { SprintInput } from '../../value-objects/list/sprint-input.value-object.js';
import type { Sprint } from '../../value-objects/list/sprint.value-object.js';
import type { TaskListArchiveChange } from '../../value-objects/list/task-list-archive-change.value-object.js';
import type { TaskListDraft } from '../../value-objects/list/task-list-draft.value-object.js';
import type { TaskListField } from '../../value-objects/list/task-list-field.value-object.js';
import type { TaskListPatch } from '../../value-objects/list/task-list-patch.value-object.js';
import type { TaskListState } from '../../value-objects/list/task-list-state.value-object.js';
import type { TaskListUpdate } from '../../value-objects/list/task-list-update.value-object.js';
import { LOOK_COLORS } from '../../value-objects/look/look-color.value-object.js';
import type { LookColor } from '../../value-objects/look/look-color.value-object.js';
import { LOOK_ICONS } from '../../value-objects/look/look-icon.value-object.js';
import type { LookIcon } from '../../value-objects/look/look-icon.value-object.js';

/**
 * Constant datePattern
 *
 * @description
 * Shape of a calendar date (`format: date` of `Sprint` and `SprintInput` in
 * `openapi/internal/task-service.yaml`): `YYYY-MM-DD` with ASCII digits.
 *
 * @type {RegExp}
 */
const datePattern: RegExp = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Function lengthOf
 *
 * @description
 * Length of a text in Unicode code points, the characters `maxLength` of JSON Schema counts.
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
 * Refuses an empty id: a list always names its organization and its space.
 *
 * @param {string} id - The id.
 * @returns {string} The same id.
 * @throws {InvalidListError} When it is empty.
 */
function requireId(id: string): string {
  if (id === '') {
    throw new InvalidListError('the ids of the list, its organization and its space are set');
  }
  return id;
}

/**
 * Function normalizeName
 *
 * @description
 * `ListName` of `openapi/internal/task-service.yaml`: trimmed, and 1 to 80 characters once trimmed
 * (a name made only of spaces is refused).
 *
 * @param {string} name - The name as typed.
 * @returns {string} The trimmed name.
 * @throws {InvalidListError} When the trimmed name is empty or too long.
 */
function normalizeName(name: string): string {
  const trimmed: string = name.trim();
  const length: number = lengthOf(trimmed);
  if (length < 1 || length > 80) {
    throw new InvalidListError('the name has 1 to 80 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkIcon
 *
 * @description
 * `LookIcon` of `openapi/internal/task-service.yaml`, or `null` for the default icon.
 *
 * @param {LookIcon | null} icon - The icon.
 * @returns {LookIcon | null} The same icon.
 * @throws {InvalidListError} When it is not one of `LOOK_ICONS`.
 */
function checkIcon(icon: LookIcon | null): LookIcon | null {
  if (icon !== null && !LOOK_ICONS.includes(icon)) {
    throw new InvalidListError('the icon is one of the look icons or none');
  }
  return icon;
}

/**
 * Function checkColor
 *
 * @description
 * `LookColor` of `openapi/internal/task-service.yaml`.
 *
 * @param {LookColor} color - The color.
 * @returns {LookColor} The same color.
 * @throws {InvalidListError} When it is not one of `LOOK_COLORS`.
 */
function checkColor(color: LookColor): LookColor {
  if (!LOOK_COLORS.includes(color)) {
    throw new InvalidListError('the color is one of the look colors');
  }
  return color;
}

/**
 * Function isCalendarDate
 *
 * @description
 * Whether a text is a real calendar date `YYYY-MM-DD` of the proleptic Gregorian calendar: a month
 * 1 to 12 and a day that exists in it, 29 February only in a leap year. Pure arithmetic, without
 * the clock.
 *
 * @param {string} value - The text.
 * @returns {boolean} Whether it is a calendar date.
 */
function isCalendarDate(value: string): boolean {
  if (!datePattern.test(value)) {
    return false;
  }
  const year: number = Number(value.slice(0, 4));
  const month: number = Number(value.slice(5, 7));
  const day: number = Number(value.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }
  if (month === 2) {
    const leap: boolean = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return day <= (leap ? 29 : 28);
  }
  return day <= ([4, 6, 9, 11].includes(month) ? 30 : 31);
}

/**
 * Function normalizeGoal
 *
 * @description
 * `SprintInput.goal` of `openapi/internal/task-service.yaml`: trimmed, `null` or an empty text for
 * none, 300 characters at most.
 *
 * @param {string | null} goal - The goal as typed.
 * @returns {string | null} The trimmed goal, or `null` when there is none.
 * @throws {InvalidListError} When the trimmed goal is too long.
 */
function normalizeGoal(goal: string | null): string | null {
  if (goal === null) {
    return null;
  }
  const trimmed: string = goal.trim();
  if (trimmed === '') {
    return null;
  }
  if (lengthOf(trimmed) > 300) {
    throw new InvalidListError('the sprint goal has at most 300 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkDates
 *
 * @description
 * Refuses dates that are not calendar dates `YYYY-MM-DD`.
 *
 * @param {string} startDate - The first day.
 * @param {string} endDate - The last day.
 * @throws {InvalidListError} When either is not a calendar date.
 */
function checkDates(startDate: string, endDate: string): void {
  if (!isCalendarDate(startDate) || !isCalendarDate(endDate)) {
    throw new InvalidListError('the sprint dates are calendar dates YYYY-MM-DD');
  }
}

/**
 * Function normalizeSprint
 *
 * @description
 * `SprintInput` of `openapi/internal/task-service.yaml`: two calendar dates, the last day on or
 * after the first ("La fin doit suivre le début."; the text order of `YYYY-MM-DD` is the date
 * order), and a goal that, left out, is the kept one.
 *
 * @param {SprintInput} input - The dates and the goal as sent.
 * @param {string | null} keptGoal - The goal when the input leaves it out: the current goal of a
 * sprint, `null` at a creation or for a list that becomes a sprint.
 * @returns {Sprint} The sprint.
 * @throws {InvalidListError} When a date is not a calendar date or the goal is too long.
 * @throws {SprintDatesInvalidError} When the last day is before the first.
 */
function normalizeSprint(input: SprintInput, keptGoal: string | null): Sprint {
  checkDates(input.startDate, input.endDate);
  if (input.endDate < input.startDate) {
    throw new SprintDatesInvalidError();
  }
  return {
    startDate: input.startDate,
    endDate: input.endDate,
    goal: input.goal === undefined ? keptGoal : normalizeGoal(input.goal),
  };
}

/**
 * Function patchSprint
 *
 * @description
 * Applies the `sprint` member of `ListPatch` of `openapi/internal/task-service.yaml`: left out,
 * unchanged; `null` makes a sprint a list again and drops its dates and goal; otherwise the new
 * dates and, when `goal` is left out, the current goal of a sprint, or none for a list.
 *
 * @param {Sprint | null} current - The sprint before the change, or `null` for a list.
 * @param {SprintInput | null | undefined} patch - The change.
 * @returns {Sprint | null} The sprint after the change, or `null` for a list.
 * @throws {InvalidListError} When a date is not a calendar date or the goal is too long.
 * @throws {SprintDatesInvalidError} When the last day is before the first.
 */
function patchSprint(current: Sprint | null, patch: SprintInput | null | undefined): Sprint | null {
  if (patch === undefined) {
    return current;
  }
  if (patch === null) {
    return null;
  }
  return normalizeSprint(patch, current === null ? null : current.goal);
}

/**
 * Function sameSprint
 *
 * @description
 * Whether two sprints have the same dates and goal, or are both absent.
 *
 * @param {Sprint | null} left - One sprint.
 * @param {Sprint | null} right - The other sprint.
 * @returns {boolean} Whether they are equal.
 */
function sameSprint(left: Sprint | null, right: Sprint | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.startDate === right.startDate && left.endDate === right.endDate && left.goal === right.goal
  );
}

/**
 * Function checkStoredSprint
 *
 * @description
 * Refuses a stored sprint no creation or change can produce: dates that are not calendar dates,
 * a last day before the first, or a goal not trimmed, empty or too long.
 *
 * @param {Sprint | null} sprint - The stored sprint, or `null` for a list.
 * @throws {InvalidListError} When the sprint breaks an invariant.
 */
function checkStoredSprint(sprint: Sprint | null): void {
  if (sprint === null) {
    return;
  }
  checkDates(sprint.startDate, sprint.endDate);
  if (sprint.endDate < sprint.startDate) {
    throw new InvalidListError('the last day of a sprint is on or after its first');
  }
  if (normalizeGoal(sprint.goal) !== sprint.goal) {
    throw new InvalidListError('the sprint goal is trimmed and not empty');
  }
}

/**
 * Function checkInstant
 *
 * @description
 * Refuses an instant that is not a valid `Date`: an archive or a restoration takes the instant of
 * its transaction, which the application reads from the database.
 *
 * @param {Date} instant - The instant.
 * @returns {Date} The same instant.
 * @throws {InvalidListError} When it is not a valid date.
 */
function checkInstant(instant: Date): Date {
  if (Number.isNaN(instant.getTime())) {
    throw new InvalidListError('the instants of the archive of a list are valid dates');
  }
  return instant;
}

/**
 * Function checkActor
 *
 * @description
 * `Actor` of `openapi/internal/task-service.yaml`, as `archivedBy` carries it: a known type and a
 * non-empty id.
 *
 * @param {ListActor} actor - Who archives the list.
 * @returns {ListActor} The same actor.
 * @throws {InvalidListError} When the type is unknown or the id empty.
 */
function checkActor(actor: ListActor): ListActor {
  if (!LIST_ACTOR_TYPES.includes(actor.type) || actor.id === '') {
    throw new InvalidListError('the actor of an archive has a known type and an id');
  }
  return actor;
}

/**
 * Function checkStoredArchive
 *
 * @description
 * Refuses a stored archive no archive or restoration can produce: `archivedAt` and `archivedBy`
 * both set or both null (the check `lists_archived_check` of the table), a valid instant and a
 * valid actor, and a valid `restoredAt` when set.
 *
 * @param {TaskListState} state - The stored state.
 * @throws {InvalidListError} When the archive breaks an invariant.
 */
function checkStoredArchive(state: TaskListState): void {
  if ((state.archivedAt === null) !== (state.archivedBy === null)) {
    throw new InvalidListError('the instant and the actor of an archive are set together');
  }
  if (state.archivedAt !== null) {
    checkInstant(state.archivedAt);
  }
  if (state.archivedBy !== null) {
    checkActor(state.archivedBy);
  }
  if (state.restoredAt !== null) {
    checkInstant(state.restoredAt);
  }
}

/**
 * Class TaskList
 *
 * @description
 * A list of tasks of a space, or a sprint when it has dates (`TaskList` of
 * `openapi/internal/task-service.yaml`, "Sprints" of `openapi/public/lists.yaml`). Rules:
 *
 * - its name, icon and color follow `ListCreation` and `ListPatch`;
 * - a sprint has a first day, a last day on or after it, and an optional goal of 300 characters
 *   at most; its state follows from its dates, with no start or completion;
 * - whoever has `edit` on its space creates it, whoever has `edit` on it changes it, which the
 *   application checks first with `access-role.policy.ts` ("Who sees a list" of
 *   `openapi/public/lists.yaml`, decision 2 of P3b-1);
 * - its switch "Accès de l’organisation" (`organizationAccess`) is on unless the creation or a
 *   change turns it off; a change of the switch is a change of access, apart from the content;
 * - each change that changes something takes the next version, and a change of its grants too
 *   (`recordAccessChange`); one that changes nothing keeps the same instance, so nothing is
 *   emitted;
 * - whoever has `edit` on it archives it and restores it (decision 6 of P3b-1, "Lists" and "Who"
 *   of `openapi/public/archives.yaml`): an archive sets when and by whom, a restoration clears
 *   them and sets when it came back, which puts it at the end of its space; each takes the next
 *   version, an archived list archived again or a live list restored keeps the same instance. An
 *   archived list still changes (`update`, its grants): only the collections of its space leave
 *   it out.
 *
 * The name of the first list of a new space is chosen by the application, not by this class.
 */
export class TaskList {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The state of the list; a change returns a new `TaskList`.
   *
   * @type {TaskListState}
   * @readonly
   */
  private readonly state: TaskListState;

  /**
   * Property snapshot
   *
   * @description
   * The state to store.
   *
   * @type {TaskListState}
   * @readonly
   */
  public get snapshot(): TaskListState {
    return this.state;
  }
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps a state checked by `restore` or built by a checked change.
   *
   * @param {TaskListState} state - The checked state.
   * @constructor
   */
  private constructor(state: TaskListState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * Checks and normalizes a new list or sprint (`ListCreation` of
   * `openapi/internal/task-service.yaml`): the name and the goal trimmed, an empty or absent goal
   * as none. Whether the viewer sees the space is checked by the application.
   *
   * @param {NewTaskList} input - The new list as asked.
   * @returns {TaskListDraft} The list to insert, at version 1.
   * @throws {InvalidListError} When a member breaks an invariant, which the message names.
   * @throws {SprintDatesInvalidError} When the last day of the sprint is before its first.
   */
  public static create(input: NewTaskList): TaskListDraft {
    return {
      organizationId: requireId(input.organizationId),
      spaceId: requireId(input.spaceId),
      name: normalizeName(input.name),
      icon: checkIcon(input.icon),
      color: checkColor(input.color),
      sprint: input.sprint === null ? null : normalizeSprint(input.sprint, null),
      organizationAccess: input.organizationAccess,
    };
  }

  /**
   * Method restore
   *
   * @description
   * Rebuilds a stored list, refusing a state no creation or change can produce.
   *
   * @param {TaskListState} state - The stored state.
   * @returns {TaskList} The list.
   * @throws {InvalidListError} When the version is not a positive integer, or a member breaks an
   * invariant (the order of the sprint dates and an archive set by halves included).
   */
  public static restore(state: TaskListState): TaskList {
    if (!Number.isInteger(state.version) || state.version < 1) {
      throw new InvalidListError('the version is a positive integer');
    }
    requireId(state.id);
    requireId(state.organizationId);
    requireId(state.spaceId);
    if (normalizeName(state.name) !== state.name) {
      throw new InvalidListError('the name is trimmed');
    }
    checkIcon(state.icon);
    checkColor(state.color);
    checkStoredSprint(state.sprint);
    checkStoredArchive(state);
    return new TaskList(state);
  }

  /**
   * Method update
   *
   * @description
   * Applies a JSON Merge Patch of the list (`ListPatch` of `openapi/internal/task-service.yaml`):
   * each member present takes its normalized value, and `changed` lists the members whose value
   * differs. `sprint: null` makes a sprint a list again; new sprint dates without `goal` keep the
   * current goal of a sprint, or none for a list that becomes a sprint.
   *
   * @param {TaskListPatch} patch - The change.
   * @returns {TaskListUpdate} The list at the next version and what changed, or this same list and
   * `changed: []` when nothing changes.
   * @throws {InvalidListError} When a member breaks an invariant, which the message names.
   * @throws {SprintDatesInvalidError} When the last day of the sprint is before its first.
   */
  public update(patch: TaskListPatch): TaskListUpdate {
    const current: TaskListState = this.state;
    const name: string = patch.name === undefined ? current.name : normalizeName(patch.name);
    const icon: LookIcon | null = patch.icon === undefined ? current.icon : checkIcon(patch.icon);
    const color: LookColor = patch.color === undefined ? current.color : checkColor(patch.color);
    const sprint: Sprint | null = patchSprint(current.sprint, patch.sprint);
    const organizationAccess: boolean = patch.organizationAccess ?? current.organizationAccess;
    const accessChanged: boolean = organizationAccess !== current.organizationAccess;

    const changed: TaskListField[] = [];
    if (name !== current.name) {
      changed.push('name');
    }
    if (icon !== current.icon) {
      changed.push('icon');
    }
    if (color !== current.color) {
      changed.push('color');
    }
    const sprintChanged: boolean = !sameSprint(sprint, current.sprint);
    if (sprintChanged) {
      changed.push('sprint');
    }
    if (changed.length === 0 && !accessChanged) {
      return { list: this, changed, accessChanged };
    }
    return {
      list: new TaskList({
        ...current,
        name,
        icon,
        color,
        sprint: sprintChanged ? sprint : current.sprint,
        organizationAccess,
        version: current.version + 1,
      }),
      changed,
      accessChanged,
    };
  }

  /**
   * Method recordAccessChange
   *
   * @description
   * Takes the next version for a change of the grants of the list ("Every change adds one to the
   * version of the space or the list" of `openapi/public/access.yaml`); nothing else changes.
   *
   * @returns {TaskList} The list at the next version.
   */
  public recordAccessChange(): TaskList {
    return new TaskList({ ...this.state, version: this.state.version + 1 });
  }

  /**
   * Method archive
   *
   * @description
   * Archives the list ("Archiver la liste", "Lists" of `openapi/public/archives.yaml`, decision 6
   * of P3b-1): it records when and by whom, at the next version; its tasks do not change. A list
   * archived already keeps its archive, the same instance and the same version (`200` with the
   * same version, nothing emitted).
   *
   * @param {ListActor} by - Who archives it.
   * @param {Date} at - The instant of the transaction.
   * @returns {TaskListArchiveChange} The archived list and whether it changed.
   * @throws {InvalidListError} When the actor or the instant is invalid.
   */
  public archive(by: ListActor, at: Date): TaskListArchiveChange {
    const archivedBy: ListActor = checkActor(by);
    const archivedAt: Date = checkInstant(at);
    if (this.state.archivedAt !== null) {
      return { list: this, changed: false };
    }
    return {
      list: new TaskList({
        ...this.state,
        archivedAt,
        archivedBy: { type: archivedBy.type, id: archivedBy.id },
        version: this.state.version + 1,
      }),
      changed: true,
    };
  }

  /**
   * Method unarchive
   *
   * @description
   * Restores an archived list at the end of its space ("Restaurer la liste", "Restoring a list
   * puts it back at the end of its space" of `openapi/public/archives.yaml`, decision 6 of
   * P3b-1): it clears the archive and records when it came back, at the next version. A live list
   * keeps the same instance and the same version (`200` with the same version, nothing emitted).
   *
   * @param {Date} at - The instant of the transaction.
   * @returns {TaskListArchiveChange} The restored list and whether it changed.
   * @throws {InvalidListError} When the instant is invalid.
   */
  public unarchive(at: Date): TaskListArchiveChange {
    const restoredAt: Date = checkInstant(at);
    if (this.state.archivedAt === null) {
      return { list: this, changed: false };
    }
    return {
      list: new TaskList({
        ...this.state,
        archivedAt: null,
        archivedBy: null,
        restoredAt,
        version: this.state.version + 1,
      }),
      changed: true,
    };
  }
  // #endregion
}
