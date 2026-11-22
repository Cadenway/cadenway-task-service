import type { Goal } from '../../../domain/aggregates/goal/goal.aggregate.js';
import type { GoalResult } from '../../../domain/value-objects/goal/goal-result.value-object.js';
import { GoalError } from '../../models/goal/goal-error.model.js';
import type { GoalCaller } from '../../models/goal/goal-caller.model.js';
import type { GoalViewer } from '../../models/goal/goal-viewer.model.js';
import type { GoalWrite } from '../../models/goal/goal-write.model.js';
import type { GoalsStore } from '../../models/goal/goals-store.model.js';
import type { NewGoalResult } from '../../models/goal/new-goal-result.model.js';

/** Loads current membership before accessing any tenant-scoped goal. */
export async function requireViewer(
  store: GoalsStore,
  caller: GoalCaller,
  lock: boolean,
): Promise<GoalViewer> {
  const viewer = await store.findViewer(caller, lock);
  if (viewer === null) throw new GoalError({ reason: 'missing-organization' });
  return viewer;
}

/** Authorizes the immutable placement, keeping its rights stable for a write. */
export async function requireScope(
  store: GoalsStore,
  viewer: GoalViewer,
  spaceId: string | null,
  write: boolean,
  missing: 'missing-space' | 'missing-goal',
  lock: boolean = write,
): Promise<void> {
  if (spaceId === null) {
    if (viewer.role === 'guest' && (!write || missing === 'missing-goal')) {
      throw new GoalError({ reason: missing });
    }
    if (write && viewer.role !== 'owner' && viewer.role !== 'admin') {
      throw new GoalError({ reason: 'organization-role-forbidden' });
    }
    return;
  }
  const role = await store.findScope(viewer, spaceId, lock);
  if (role === null) throw new GoalError({ reason: missing });
  if (write && role !== 'edit') throw new GoalError({ reason: 'role-insufficient', role });
}

/** Reads placement first, then locks its authorization and aggregate in a fixed order. */
export async function requireGoal(
  store: GoalsStore,
  viewer: GoalViewer,
  goalId: string,
  write: boolean,
  lockScope = true,
): Promise<Goal> {
  const placement = await store.goals.find(viewer.organizationId, goalId, false);
  if (placement === null) throw new GoalError({ reason: 'missing-goal' });
  await requireScope(store, viewer, placement.goal.snapshot.spaceId, write, 'missing-goal', false);
  if (!write) return placement.goal;
  const locked = await store.goals.find(viewer.organizationId, goalId, true);
  if (locked?.goal.snapshot.spaceId !== placement.goal.snapshot.spaceId) {
    throw new GoalError({ reason: 'missing-goal' });
  }
  if (lockScope) {
    await requireScope(store, viewer, locked.goal.snapshot.spaceId, true, 'missing-goal');
  }
  return locked.goal;
}

/** Checks the optional condition after authorization and aggregate locking. */
export function requireVersion(goal: Goal, input: GoalWrite): void {
  if (input.expectedVersions !== null && !input.expectedVersions.includes(goal.snapshot.version)) {
    throw new GoalError({ reason: 'version-mismatch', version: goal.snapshot.version });
  }
}

/** Ensures a selected owner is a current member who can read this goal. */
export async function requireEligibleOwner(store: GoalsStore, goal: Goal): Promise<void> {
  const { organizationId, ownerUserId, spaceId } = goal.snapshot;
  if (!(await store.ownerCanReadScope(organizationId, ownerUserId, spaceId, true))) {
    throw new GoalError({ reason: 'owner-ineligible' });
  }
}

/** Ensures linked targets are currently readable and suitable, holding them through a write. */
export async function requireVisibleTargets(
  store: GoalsStore,
  viewer: GoalViewer,
  results: readonly (GoalResult | NewGoalResult)[],
  missing: 'result-target-invalid' | 'missing-result',
  lock = true,
  scopeSpaceId?: string | null,
  scopeMissing?: 'missing-space' | 'missing-goal',
): Promise<void> {
  const normalized = results.map((result) =>
    result.kind === 'list-progress' ? { ...result, listId: result.listId.toLowerCase() } : result,
  );
  const links = await store.measureLinks(viewer, normalized, lock, scopeSpaceId);
  if (scopeMissing !== undefined) {
    await requireScope(store, viewer, scopeSpaceId ?? null, true, scopeMissing, false);
  }
  for (const result of normalized) {
    if (
      (result.kind === 'list-progress' && !links.lists.has(result.listId)) ||
      (result.kind === 'milestone' && !links.milestones.has(result.taskKey))
    ) {
      throw new GoalError({ reason: missing });
    }
  }
}
