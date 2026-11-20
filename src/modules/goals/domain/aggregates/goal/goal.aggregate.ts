import { InvalidGoalError } from '../../errors/goal/invalid-goal.error.js';
import type { GoalDraft } from '../../value-objects/goal/goal-draft.value-object.js';
import type { GoalPatch } from '../../value-objects/goal/goal-patch.value-object.js';
import { GoalQuarter } from '../../value-objects/goal/goal-quarter.value-object.js';
import type { GoalResultPatch } from '../../value-objects/goal/goal-result-patch.value-object.js';
import type { GoalResult } from '../../value-objects/goal/goal-result.value-object.js';
import type { GoalState } from '../../value-objects/goal/goal-state.value-object.js';

/** Resource identifier format in `components/goals.yaml`. */
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Goal and key result identifier format in `components/goals.yaml`. */
const uuidV7 = /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/** Stable public task key format in `components/task.yaml`. */
const taskKey = /^[A-Z]{2,5}-[1-9][0-9]{0,8}$/;

/** Maximum number of key results in `components/goals.yaml`. */
const resultLimit = 20;

/** Mutable fields of the goal metadata patch in `components/goals.yaml`. */
const goalPatchFields: ReadonlySet<string> = new Set(['name', 'ownerUserId', 'dueDate']);

/** Mutable fields of the result patch in `components/goals.yaml`. */
const resultPatchFields: ReadonlySet<string> = new Set(['label', 'currentValue', 'checked']);

/** A goal and its key results, with fixed placement and a shared version (P3c brief, P3c-2). */
export class Goal {
  // #region Constructor
  /** Keeps a checked, immutable snapshot. */
  private constructor(public readonly snapshot: GoalState) {
    Object.freeze(this);
  }
  // #endregion

  // #region Methods
  /** Creates a goal with its initial results and version in one operation. */
  public static create(draft: GoalDraft): Goal {
    return Goal.reconstitute({
      ...draft,
      spaceId: draft.spaceId ?? null,
      results: draft.results ?? [],
      version: 1,
    });
  }

  /** Reconstitutes persisted state using the same invariants as creation. */
  public static reconstitute(state: GoalState): Goal {
    if (!Number.isSafeInteger(state.version) || state.version < 1) {
      throw new InvalidGoalError('invalid-goal', 'the goal version is a positive integer');
    }
    GoalQuarter.parse(state.quarter).requireDueDate(state.dueDate);
    return new Goal(
      Object.freeze({
        organizationId: requireId(state.organizationId, uuid, 'invalid-goal'),
        id: requireId(state.id, uuidV7, 'invalid-goal'),
        name: normalizeText(state.name, 'invalid-goal'),
        quarter: state.quarter,
        ownerUserId: requireId(state.ownerUserId, uuid, 'invalid-goal'),
        spaceId: state.spaceId === null ? null : requireId(state.spaceId, uuid, 'invalid-goal'),
        dueDate: state.dueDate,
        version: state.version,
        results: normalizeResults(state.results),
      }),
    );
  }

  /** Applies the writable metadata; a semantically equal patch preserves the current version. */
  public update(patch: GoalPatch): Goal {
    if (Object.keys(patch).some((field) => !goalPatchFields.has(field))) {
      throw new InvalidGoalError('invalid-goal', 'only goal metadata can be changed');
    }
    const { name, ownerUserId, dueDate } = this.snapshot;
    const nextName = patch.name === undefined ? name : normalizeText(patch.name, 'invalid-goal');
    const nextOwner =
      patch.ownerUserId === undefined
        ? ownerUserId
        : requireId(patch.ownerUserId, uuid, 'invalid-goal');
    const nextDueDate = patch.dueDate ?? dueDate;
    if (nextName === name && nextOwner === ownerUserId && nextDueDate === dueDate) return this;
    return this.next({ name: nextName, ownerUserId: nextOwner, dueDate: nextDueDate });
  }

  /** Appends a result while enforcing the aggregate's capacity and identity rules. */
  public addResult(result: GoalResult): Goal {
    return this.next({ results: [...this.snapshot.results, result] });
  }

  /** Applies a kind-specific patch while preserving the assigned endpoints and target. */
  public updateResult(resultId: string, patch: GoalResultPatch): Goal {
    const result = this.requireResult(resultId);
    const next = patchResult(result, patch);
    if (next === result) return this;
    return this.next({
      results: this.snapshot.results.map((entry) => (entry === result ? next : entry)),
    });
  }

  /** Removes the identified result, releasing one slot. */
  public removeResult(resultId: string): Goal {
    const result = this.requireResult(resultId);
    return this.next({ results: this.snapshot.results.filter((entry) => entry !== result) });
  }

  /** Resolves a result in the goal, or reports that it is absent. */
  private requireResult(resultId: string): GoalResult {
    const id = resultId.toLowerCase();
    const result = this.snapshot.results.find((entry) => entry.id === id);
    if (result === undefined) {
      throw new InvalidGoalError('result-not-found', 'the goal does not contain the key result');
    }
    return result;
  }

  /** Advances the shared version once for a real change. */
  private next(
    update: Partial<Pick<GoalState, 'name' | 'ownerUserId' | 'dueDate' | 'results'>>,
  ): Goal {
    return Goal.reconstitute({ ...this.snapshot, ...update, version: this.snapshot.version + 1 });
  }
  // #endregion
}

/** Validates a UUID and normalizes its representation for comparison. */
function requireId(id: string, format: RegExp, reason: 'invalid-goal' | 'invalid-result'): string {
  if (typeof id !== 'string' || !format.test(id))
    throw new InvalidGoalError(reason, 'the goal or key result has an invalid identifier');
  return id.toLowerCase();
}

/** Applies the trim, non-blank and Unicode length rules in `components/goals.yaml`. */
function normalizeText(text: string, reason: 'invalid-goal' | 'invalid-result'): string {
  if (typeof text === 'string') {
    const value = text.trim();
    if (value !== '' && Array.from(value).length <= 300) return value;
  }
  throw new InvalidGoalError(reason, 'the name or label has between 1 and 300 characters');
}

/** Validates the result collection and protects it from external mutation. */
function normalizeResults(results: readonly GoalResult[]): readonly GoalResult[] {
  if (!Array.isArray(results)) {
    throw new InvalidGoalError('invalid-result', 'the goal key results form a collection');
  }
  if (results.length > resultLimit) {
    throw new InvalidGoalError('result-limit-reached', 'a goal has at most 20 key results');
  }
  const normalized = Array.from(results, normalizeResult);
  if (new Set(normalized.map((result) => result.id)).size !== normalized.length) {
    throw new InvalidGoalError('invalid-result', 'the goal key result identifiers are unique');
  }
  return Object.freeze(normalized);
}

/** Checks each variant before taking an immutable copy of its persisted fields. */
function normalizeResult(result: GoalResult | null | undefined): GoalResult {
  if (typeof result !== 'object' || result === null) {
    throw new InvalidGoalError(
      'invalid-result',
      'the goal key result must have the fields of its kind',
    );
  }
  const id = requireId(result.id, uuidV7, 'invalid-result');
  const label = normalizeText(result.label, 'invalid-result');
  const kind = result.kind;
  switch (kind) {
    case 'number': {
      const { startValue, currentValue, targetValue } = result;
      if ([startValue, currentValue, targetValue].every(Number.isFinite)) {
        return Object.freeze({ id, label, kind, startValue, currentValue, targetValue });
      }
      break;
    }
    case 'checkbox':
      if (typeof result.checked === 'boolean')
        return Object.freeze({ id, label, kind, checked: result.checked });
      break;
    case 'list-progress':
      return Object.freeze({
        id,
        label,
        kind,
        listId: requireId(result.listId, uuid, 'invalid-result'),
      });
    case 'milestone':
      if (typeof result.taskKey === 'string' && taskKey.test(result.taskKey))
        return Object.freeze({ id, label, kind, taskKey: result.taskKey });
      break;
  }
  throw new InvalidGoalError(
    'invalid-result',
    'the goal key result must have the fields of its kind',
  );
}

/** Applies only the matching progress field and reuses the input when the patch has no effect. */
function patchResult(result: GoalResult, patch: GoalResultPatch): GoalResult {
  if (
    Object.keys(patch).some((field) => !resultPatchFields.has(field)) ||
    (patch.currentValue !== undefined &&
      (result.kind !== 'number' || !Number.isFinite(patch.currentValue))) ||
    (patch.checked !== undefined &&
      (result.kind !== 'checkbox' || typeof patch.checked !== 'boolean'))
  ) {
    throw new InvalidGoalError('result-patch-invalid', 'the key result patch must match its kind');
  }
  const label =
    patch.label === undefined ? result.label : normalizeText(patch.label, 'invalid-result');
  if (
    result.kind === 'number' &&
    patch.currentValue !== undefined &&
    patch.currentValue !== result.currentValue
  ) {
    return { ...result, label, currentValue: patch.currentValue };
  }
  if (
    result.kind === 'checkbox' &&
    patch.checked !== undefined &&
    patch.checked !== result.checked
  ) {
    return { ...result, label, checked: patch.checked };
  }
  return label === result.label ? result : { ...result, label };
}
