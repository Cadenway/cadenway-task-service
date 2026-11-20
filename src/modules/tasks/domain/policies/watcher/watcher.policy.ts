import type { AccessRole } from '../../value-objects/access/access-role.value-object.js';
import type { TaskActor } from '../../value-objects/task/task-actor.value-object.js';
import type { WatcherOverride } from '../../value-objects/watcher/watcher-override.value-object.js';

/** Maximum number of explicit watcher overrides on one task. */
export const WATCHER_OVERRIDE_LIMIT = 100;

/**
 * Whether a caller may change the subject's override (P3b-2 decision 8). This decision must be
 * made before checking whether the subject is eligible.
 *
 * @param role - The caller's effective list role.
 * @param actorUserId - The calling account.
 * @param subjectUserId - The account whose override is changed.
 * @returns Whether the change is permitted.
 */
export function canChangeWatcher(
  role: AccessRole,
  actorUserId: string,
  subjectUserId: string,
): boolean {
  return (
    role === 'edit' ||
    (role === 'comment' && actorUserId.toLowerCase() === subjectUserId.toLowerCase())
  );
}

/**
 * Computes effective watchers from defaults, per-account overrides and a current eligibility
 * snapshot (P3b-2 decisions 7 and 8). The caller obtains eligible IDs from membership and list
 * access in the same transaction, and must not pass ineligible accounts in that set.
 *
 * @param creator - The task's trusted creator.
 * @param assignees - Current task assignees.
 * @param overrides - Explicit follow and unfollow values.
 * @param eligibleUserIds - Current members with read access to the list.
 * @returns Distinct eligible account IDs, in ascending order.
 */
export function effectiveWatchers(
  creator: TaskActor,
  assignees: readonly string[],
  overrides: readonly WatcherOverride[],
  eligibleUserIds: ReadonlySet<string>,
): readonly string[] {
  const eligible = new Set([...eligibleUserIds].map((id: string): string => id.toLowerCase()));
  return watcherCandidates(creator, assignees, overrides).filter((id) => eligible.has(id));
}

/** Returns distinct candidate IDs, including explicit follows and excluding explicit opt-outs. */
export function watcherCandidates(
  creator: TaskActor,
  assignees: readonly string[],
  overrides: readonly WatcherOverride[],
): readonly string[] {
  const chosen = new Set<string>(assignees.map((id: string): string => id.toLowerCase()));
  if (creator.type === 'user') {
    chosen.add(creator.id.toLowerCase());
  }
  for (const override of overrides) {
    const id: string = override.userId.toLowerCase();
    if (override.following) {
      chosen.add(id);
    } else {
      chosen.delete(id);
    }
  }
  return [...chosen].sort();
}
