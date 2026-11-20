/** Maximum incident edges on a task, including retained edges. */
export const DEPENDENCY_LIMIT: number = 100;

/**
 * Orders invariant failures without revealing the path of a cycle.
 *
 * @param blockerId - Task at the origin of the proposed edge.
 * @param blockedId - Task at the destination of the proposed edge.
 * @param check - Duplicate, reachability and incident capacity derived under the graph lock.
 * @returns The public-safe reason, or null when the edge can be inserted.
 */
export function dependencyRefusal(
  blockerId: string,
  blockedId: string,
  check: { readonly duplicate: boolean; readonly cycle: boolean; readonly limitReached: boolean },
): 'dependency-cycle' | 'dependency-already-exists' | 'dependency-limit-reached' | null {
  if (blockerId === blockedId) return 'dependency-cycle';
  if (check.duplicate) return 'dependency-already-exists';
  if (check.cycle) return 'dependency-cycle';
  if (check.limitReached) return 'dependency-limit-reached';
  return null;
}
