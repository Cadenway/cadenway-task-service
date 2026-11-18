import { InvalidSpaceError } from '../../errors/space/invalid-space.error.js';
import { SpaceStatusRequiredError } from '../../errors/space/space-status-required.error.js';
import { SpaceVisibilityForbiddenError } from '../../errors/space/space-visibility-forbidden.error.js';
import { canChangeVisibility, canSeeSpace } from '../../policies/space/space-access.policy.js';
import { LOOK_COLORS } from '../../value-objects/look/look-color.value-object.js';
import type { LookColor } from '../../value-objects/look/look-color.value-object.js';
import { LOOK_ICONS } from '../../value-objects/look/look-icon.value-object.js';
import type { LookIcon } from '../../value-objects/look/look-icon.value-object.js';
import type { Viewer } from '../../value-objects/member/viewer.value-object.js';
import type { NewSpace } from '../../value-objects/space/new-space.value-object.js';
import type { SpaceDraft } from '../../value-objects/space/space-draft.value-object.js';
import type { SpaceField } from '../../value-objects/space/space-field.value-object.js';
import type { SpacePatch } from '../../value-objects/space/space-patch.value-object.js';
import type { SpaceState } from '../../value-objects/space/space-state.value-object.js';
import type { SpaceUpdate } from '../../value-objects/space/space-update.value-object.js';
import type { Visibility } from '../../value-objects/space/visibility.value-object.js';
import type { SpaceStatus } from '../../value-objects/status/space-status.value-object.js';
import { DEFAULT_SPACE_STATUSES } from '../../value-objects/status/space-statuses.value-object.js';
import type { SpaceStatuses } from '../../value-objects/status/space-statuses.value-object.js';
import { STATUS_KEYS } from '../../value-objects/status/status-key.value-object.js';
import type { StatusKey } from '../../value-objects/status/status-key.value-object.js';
import type { StatusPatch } from '../../value-objects/status/status-patch.value-object.js';
import type { StatusesPatch } from '../../value-objects/status/statuses-patch.value-object.js';

/**
 * Constant prefixPattern
 *
 * @description
 * `SpacePrefix` of `openapi/internal/task-service.yaml` ("De 2 à 5 lettres, sans accent."): 2 to 5
 * uppercase letters A to Z.
 *
 * @type {RegExp}
 */
const prefixPattern: RegExp = /^[A-Z]{2,5}$/;

/**
 * Constant visibilities
 *
 * @description
 * The values of `Visibility` of `openapi/internal/task-service.yaml`, to refuse any other at run
 * time.
 *
 * @type {readonly Visibility[]}
 */
const visibilities: readonly Visibility[] = Object.freeze(['organization', 'private']);

/**
 * Constant requiredStatuses
 *
 * @description
 * The statuses a space always uses ("Statuses" of `openapi/public/spaces.yaml`).
 *
 * @type {readonly StatusKey[]}
 */
const requiredStatuses: readonly StatusKey[] = Object.freeze(['todo', 'done']);

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
 * Refuses an empty id: a space always names its organization and its owner.
 *
 * @param {string} id - The id.
 * @returns {string} The same id.
 * @throws {InvalidSpaceError} When it is empty.
 */
function requireId(id: string): string {
  if (id === '') {
    throw new InvalidSpaceError('the ids of the space, its organization and its owner are set');
  }
  return id;
}

/**
 * Function normalizeName
 *
 * @description
 * `SpaceName` of `openapi/internal/task-service.yaml`: trimmed, and 1 to 80 characters once
 * trimmed (a name made only of spaces is refused).
 *
 * @param {string} name - The name as typed.
 * @returns {string} The trimmed name.
 * @throws {InvalidSpaceError} When the trimmed name is empty or too long.
 */
function normalizeName(name: string): string {
  const trimmed: string = name.trim();
  const length: number = lengthOf(trimmed);
  if (length < 1 || length > 80) {
    throw new InvalidSpaceError('the name has 1 to 80 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkPrefix
 *
 * @description
 * `SpacePrefix` of `openapi/internal/task-service.yaml`. Whether another space of the organization
 * owns it, now or formerly ("Prefixes and keys" of `openapi/public/spaces.yaml`), is checked by the
 * application against the stored prefixes.
 *
 * @param {string} prefix - The prefix.
 * @returns {string} The same prefix.
 * @throws {InvalidSpaceError} When it is not 2 to 5 uppercase letters A to Z.
 */
function checkPrefix(prefix: string): string {
  if (!prefixPattern.test(prefix)) {
    throw new InvalidSpaceError('the prefix has 2 to 5 uppercase letters A to Z');
  }
  return prefix;
}

/**
 * Function normalizeDescription
 *
 * @description
 * `SpaceDescription` of `openapi/internal/task-service.yaml`: trimmed, `null` or an empty text for
 * none, 500 characters at most.
 *
 * @param {string | null} description - The description as typed.
 * @returns {string | null} The trimmed description, or `null` when there is none.
 * @throws {InvalidSpaceError} When the trimmed description is too long.
 */
function normalizeDescription(description: string | null): string | null {
  if (description === null) {
    return null;
  }
  const trimmed: string = description.trim();
  if (trimmed === '') {
    return null;
  }
  if (lengthOf(trimmed) > 500) {
    throw new InvalidSpaceError('the description has at most 500 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function checkIcon
 *
 * @description
 * `LookIcon` of `openapi/internal/task-service.yaml`, or `null` for the initial.
 *
 * @param {LookIcon | null} icon - The icon.
 * @returns {LookIcon | null} The same icon.
 * @throws {InvalidSpaceError} When it is not one of `LOOK_ICONS`.
 */
function checkIcon(icon: LookIcon | null): LookIcon | null {
  if (icon !== null && !LOOK_ICONS.includes(icon)) {
    throw new InvalidSpaceError('the icon is one of the look icons or none');
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
 * @throws {InvalidSpaceError} When it is not one of `LOOK_COLORS`.
 */
function checkColor(color: LookColor): LookColor {
  if (!LOOK_COLORS.includes(color)) {
    throw new InvalidSpaceError('the color is one of the look colors');
  }
  return color;
}

/**
 * Function checkVisibility
 *
 * @description
 * `Visibility` of `openapi/internal/task-service.yaml`.
 *
 * @param {Visibility} visibility - The visibility.
 * @returns {Visibility} The same visibility.
 * @throws {InvalidSpaceError} When it is neither `organization` nor `private`.
 */
function checkVisibility(visibility: Visibility): Visibility {
  if (!visibilities.includes(visibility)) {
    throw new InvalidSpaceError('the visibility is organization or private');
  }
  return visibility;
}

/**
 * Function normalizeStatusName
 *
 * @description
 * `SpaceStatusPatch.name` of `openapi/internal/task-service.yaml`: trimmed, 1 to 24 characters once
 * trimmed (a name made only of spaces is refused); `null` for the default label.
 *
 * @param {string | null} name - The name as typed.
 * @returns {string | null} The trimmed name, or `null` for the default label.
 * @throws {InvalidSpaceError} When the trimmed name is empty or too long.
 */
function normalizeStatusName(name: string | null): string | null {
  if (name === null) {
    return null;
  }
  const trimmed: string = name.trim();
  const length: number = lengthOf(trimmed);
  if (length < 1 || length > 24) {
    throw new InvalidSpaceError('a status name has 1 to 24 characters once trimmed');
  }
  return trimmed;
}

/**
 * Function patchStatuses
 *
 * @description
 * Applies `SpaceStatusesPatch` of `openapi/internal/task-service.yaml`: `null` puts back every
 * default; a key left out is unchanged; a key set to `null` puts back its default label and uses it
 * again; otherwise `name` and `hidden`, each when present. Keys other than the ten are ignored, as
 * the contract does not close the object.
 *
 * @param {SpaceStatuses} current - The statuses before the change.
 * @param {StatusesPatch | null} patch - The change.
 * @returns {SpaceStatuses} The statuses after the change.
 * @throws {InvalidSpaceError} When a status name is empty or too long once trimmed.
 * @throws {SpaceStatusRequiredError} When the change hides `todo` or `done`.
 */
function patchStatuses(current: SpaceStatuses, patch: StatusesPatch | null): SpaceStatuses {
  if (patch === null) {
    return DEFAULT_SPACE_STATUSES;
  }
  const next: Record<StatusKey, SpaceStatus> = { ...current };
  for (const key of STATUS_KEYS) {
    const change: StatusPatch | null | undefined = patch[key];
    if (change === undefined) {
      continue;
    }
    if (change === null) {
      next[key] = DEFAULT_SPACE_STATUSES[key];
      continue;
    }
    const name: string | null =
      change.name === undefined ? current[key].name : normalizeStatusName(change.name);
    const hidden: boolean = change.hidden ?? current[key].hidden;
    if (hidden && requiredStatuses.includes(key)) {
      throw new SpaceStatusRequiredError(key);
    }
    next[key] = { name, hidden };
  }
  return next;
}

/**
 * Function sameStatuses
 *
 * @description
 * Whether two sets of statuses show every status the same way, key by key.
 *
 * @param {SpaceStatuses} left - One set.
 * @param {SpaceStatuses} right - The other set.
 * @returns {boolean} Whether they are equal.
 */
function sameStatuses(left: SpaceStatuses, right: SpaceStatuses): boolean {
  return STATUS_KEYS.every(
    (key: StatusKey): boolean =>
      left[key].name === right[key].name && left[key].hidden === right[key].hidden,
  );
}

/**
 * Function checkStoredStatuses
 *
 * @description
 * Refuses stored statuses no change can produce: a missing key, a name not trimmed or out of 1 to
 * 24 characters, or `todo` or `done` hidden.
 *
 * @param {SpaceStatuses} statuses - The stored statuses.
 * @throws {InvalidSpaceError} When the statuses break an invariant.
 */
function checkStoredStatuses(statuses: SpaceStatuses): void {
  for (const key of STATUS_KEYS) {
    if (!Object.hasOwn(statuses, key)) {
      throw new InvalidSpaceError('the space shows each of the ten statuses');
    }
    const status: SpaceStatus = statuses[key];
    if (normalizeStatusName(status.name) !== status.name) {
      throw new InvalidSpaceError('a status name is trimmed');
    }
    if (status.hidden && requiredStatuses.includes(key)) {
      throw new InvalidSpaceError('todo and done are never hidden');
    }
  }
}

/**
 * Class Space
 *
 * @description
 * A space ("Espace", `Space` of `openapi/internal/task-service.yaml`): the lists and sprints of a
 * team or a domain, the prefix of their task keys, its appearance, who sees it and how it names its
 * statuses. Rules:
 *
 * - its name, prefix, description, icon, color and visibility follow `SpaceCreation` and
 *   `SpacePatch`; a prefix owned by another space is refused by the application ("Prefixes and
 *   keys" of `openapi/public/spaces.yaml`);
 * - a space renames a status (24 characters at most) or stops using it, but `todo` and `done` are
 *   always used ("Statuses" of `openapi/public/spaces.yaml`);
 * - who sees it and who changes its visibility follow `space-access.policy.ts` (decision 3 of the
 *   P3a plan); any member who sees it changes the rest, which the application checks first;
 * - each change that changes something takes the next version; one that changes nothing keeps the
 *   same instance, so no `space.updated.v1` is emitted.
 */
export class Space {
  // #region Properties
  /**
   * Property state
   *
   * @description
   * The state of the space; a change returns a new `Space`.
   *
   * @type {SpaceState}
   * @readonly
   */
  private readonly state: SpaceState;

  /**
   * Property snapshot
   *
   * @description
   * The state to store.
   *
   * @type {SpaceState}
   * @readonly
   */
  public get snapshot(): SpaceState {
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
   * @param {SpaceState} state - The checked state.
   * @constructor
   */
  private constructor(state: SpaceState) {
    this.state = state;
  }
  // #endregion

  // #region Methods
  /**
   * Method create
   *
   * @description
   * Checks and normalizes a new space (`SpaceCreation` of `openapi/internal/task-service.yaml`): the
   * name and the description trimmed, an empty description as none, every status under its default
   * label and used. Whether the viewer may create a space (`canCreateSpace`) and whether the prefix
   * is free are checked by the application.
   *
   * @param {NewSpace} input - The new space as asked.
   * @returns {SpaceDraft} The space to insert, at version 1.
   * @throws {InvalidSpaceError} When a member breaks an invariant, which the message names.
   */
  public static create(input: NewSpace): SpaceDraft {
    return {
      organizationId: requireId(input.organizationId),
      name: normalizeName(input.name),
      prefix: checkPrefix(input.prefix),
      description: normalizeDescription(input.description),
      icon: checkIcon(input.icon),
      color: checkColor(input.color),
      visibility: checkVisibility(input.visibility),
      ownerUserId: requireId(input.ownerUserId),
      statuses: DEFAULT_SPACE_STATUSES,
    };
  }

  /**
   * Method restore
   *
   * @description
   * Rebuilds a stored space, refusing a state no creation or change can produce.
   *
   * @param {SpaceState} state - The stored state.
   * @returns {Space} The space.
   * @throws {InvalidSpaceError} When the version is not a positive integer, or a member breaks an
   * invariant (`todo` or `done` hidden included).
   */
  public static restore(state: SpaceState): Space {
    if (!Number.isInteger(state.version) || state.version < 1) {
      throw new InvalidSpaceError('the version is a positive integer');
    }
    requireId(state.id);
    requireId(state.organizationId);
    requireId(state.ownerUserId);
    if (normalizeName(state.name) !== state.name) {
      throw new InvalidSpaceError('the name is trimmed');
    }
    checkPrefix(state.prefix);
    if (normalizeDescription(state.description) !== state.description) {
      throw new InvalidSpaceError('the description is trimmed and not empty');
    }
    checkIcon(state.icon);
    checkColor(state.color);
    checkVisibility(state.visibility);
    checkStoredStatuses(state.statuses);
    return new Space(state);
  }

  /**
   * Method update
   *
   * @description
   * Applies a JSON Merge Patch of the space (`SpacePatch` of `openapi/internal/task-service.yaml`):
   * each member present takes its normalized value, and `changed` lists the members whose value
   * differs, the statuses compared key by key. Setting the visibility the space already has is no
   * change, and is allowed to anyone. `statuses: null` puts back every default. The caller has
   * checked that the viewer sees the space, and the application checks that the new prefix is
   * free.
   *
   * @param {SpacePatch} patch - The change.
   * @param {Viewer} viewer - The member who changes the space.
   * @returns {SpaceUpdate} The space at the next version and what changed, or this same space and
   * `changed: []` when nothing changes.
   * @throws {InvalidSpaceError} When a member breaks an invariant, which the message names.
   * @throws {SpaceStatusRequiredError} When the patch hides `todo` or `done`.
   * @throws {SpaceVisibilityForbiddenError} When the visibility changes and the viewer is neither
   * the owner of the space nor the owner or an admin of the organization.
   */
  public update(patch: SpacePatch, viewer: Viewer): SpaceUpdate {
    const current: SpaceState = this.state;
    const name: string = patch.name === undefined ? current.name : normalizeName(patch.name);
    const prefix: string = patch.prefix === undefined ? current.prefix : checkPrefix(patch.prefix);
    const description: string | null =
      patch.description === undefined
        ? current.description
        : normalizeDescription(patch.description);
    const icon: LookIcon | null = patch.icon === undefined ? current.icon : checkIcon(patch.icon);
    const color: LookColor = patch.color === undefined ? current.color : checkColor(patch.color);
    const visibility: Visibility =
      patch.visibility === undefined ? current.visibility : checkVisibility(patch.visibility);
    const statuses: SpaceStatuses =
      patch.statuses === undefined
        ? current.statuses
        : patchStatuses(current.statuses, patch.statuses);

    if (visibility !== current.visibility && !canChangeVisibility(current, viewer)) {
      throw new SpaceVisibilityForbiddenError();
    }

    const changed: SpaceField[] = [];
    if (name !== current.name) {
      changed.push('name');
    }
    if (prefix !== current.prefix) {
      changed.push('prefix');
    }
    if (description !== current.description) {
      changed.push('description');
    }
    if (icon !== current.icon) {
      changed.push('icon');
    }
    if (color !== current.color) {
      changed.push('color');
    }
    if (visibility !== current.visibility) {
      changed.push('visibility');
    }
    const statusesChanged: boolean = !sameStatuses(statuses, current.statuses);
    if (statusesChanged) {
      changed.push('statuses');
    }
    if (changed.length === 0) {
      return { space: this, changed };
    }
    return {
      space: new Space({
        ...current,
        name,
        prefix,
        description,
        icon,
        color,
        visibility,
        statuses: statusesChanged ? statuses : current.statuses,
        version: current.version + 1,
      }),
      changed,
    };
  }

  /**
   * Method handOver
   *
   * @description
   * Makes the owner of the organization the owner of a private space whose owner is no longer a
   * member ("Who changes what" of `openapi/public/spaces.yaml`). A space of the whole organization
   * keeps a former member as owner (`UserRef` of `openapi/internal/task-service.yaml`): for it,
   * nothing changes.
   *
   * @param {string} ownerUserId - Account of the owner of the organization.
   * @returns {SpaceUpdate} The space at the next version with `changed: ['ownerUserId']`, or this
   * same space and `changed: []` when that account already owns it or the space is not private.
   * @throws {InvalidSpaceError} When the account is empty.
   */
  public handOver(ownerUserId: string): SpaceUpdate {
    requireId(ownerUserId);
    if (ownerUserId === this.state.ownerUserId || this.state.visibility !== 'private') {
      return { space: this, changed: [] };
    }
    return {
      space: new Space({ ...this.state, ownerUserId, version: this.state.version + 1 }),
      changed: ['ownerUserId'],
    };
  }

  /**
   * Method isVisibleTo
   *
   * @description
   * Whether a member sees the space, and so its lists and tasks (`canSeeSpace`, decision 3 of the
   * P3a plan).
   *
   * @param {Viewer} viewer - The member who asks.
   * @returns {boolean} Whether the member sees the space.
   */
  public isVisibleTo(viewer: Viewer): boolean {
    return canSeeSpace(this.state, viewer);
  }
  // #endregion
}
