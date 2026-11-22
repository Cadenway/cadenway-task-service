import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import { GoalQuarter } from '../../../../../domain/value-objects/goal/goal-quarter.value-object.js';
import type { GoalPosition } from '../../../../models/goal/goal-position.model.js';
import type { GoalRecord } from '../../../../models/goal/goal-record.model.js';
import type { GoalViewer } from '../../../../models/goal/goal-viewer.model.js';
import type { GoalsStore } from '../../../../models/goal/goals-store.model.js';
import type { GoalView } from '../../../../models/goal/goal-view.model.js';
import type { GoalsUnitOfWork } from '../../../../ports/outbound/transactions/goal/goals-unit-of-work.port.js';
import { requireViewer } from '../../../../services/goal/goal-access.service.js';
import { projectGoal } from '../../../../services/goal/goal-projection.service.js';
import type { ListGoalsInput } from './list-goals.input.js';
import type { ListGoalsOutput } from './list-goals.output.js';

const batchSize = 100;

/** Lists caller-visible goals and computes a quarter summary before pagination. */
export class ListGoals {
  // #region Constructor
  /** Binds the consistent read snapshot. */
  public constructor(private readonly work: GoalsUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Scans bounded candidate batches and applies current visibility before paging. */
  public execute(input: ListGoalsInput): Promise<ListGoalsOutput> {
    return this.work
      .read(async (store) => scanVisible(store, await requireViewer(store, input, false), input))
      .catch(rethrowGoalFailure);
  }
  // #endregion
}

/** Filters a bounded page before revealing either its records or measurements. */
async function visibleBatch(
  store: GoalsStore,
  viewer: GoalViewer,
  candidates: readonly GoalRecord[],
): Promise<readonly GoalRecord[]> {
  const spaceIds = [
    ...new Set(
      candidates.flatMap(({ goal }) =>
        goal.snapshot.spaceId === null ? [] : [goal.snapshot.spaceId],
      ),
    ),
  ];
  const visible =
    spaceIds.length === 0 ? new Set<string>() : await store.visibleSpaces(viewer, spaceIds);
  return candidates.filter(
    ({ goal }) => goal.snapshot.spaceId === null || visible.has(goal.snapshot.spaceId),
  );
}

function follows(position: GoalPosition, after: GoalPosition | null): boolean {
  if (after === null) return true;
  const difference = position.createdAt.getTime() - after.createdAt.getTime();
  return difference < 0 || (difference === 0 && position.id < after.id);
}

/** Produces the page and the entire visible quarter's summary in one pass. */
async function scanVisible(
  store: GoalsStore,
  viewer: GoalViewer,
  input: ListGoalsInput,
): Promise<ListGoalsOutput> {
  const expectedProgressPercent = GoalQuarter.parse(input.quarter).expectedProgress(input.today);
  if (viewer.role === 'guest') {
    // Guests cannot have a direct role on a space, and organization goals also exclude them.
    return {
      items: [],
      nextPosition: null,
      summary: {
        goalCount: 0,
        expectedProgressPercent,
        averageProgressPercent: 0,
        onTrackOrAchievedCount: 0,
        achievedCount: 0,
        atRiskOrBehindCount: 0,
      },
    };
  }

  let after: GoalPosition | null = null;
  let goalCount = 0;
  let totalProgress = 0;
  let onTrackOrAchievedCount = 0;
  let achievedCount = 0;
  const items: { readonly view: GoalView; readonly position: GoalPosition }[] = [];

  for (;;) {
    const candidates = await store.goals.listCandidates(
      viewer.organizationId,
      input.quarter,
      after,
      batchSize,
    );
    if (candidates.length === 0) break;
    const visible = await visibleBatch(store, viewer, candidates);
    if (visible.length > 0) {
      const links = await store.measureLinks(
        viewer,
        visible.flatMap((record) => record.goal.snapshot.results),
        false,
      );
      for (const record of visible) {
        const view: GoalView = projectGoal(record.goal, input.today, links);
        goalCount += 1;
        totalProgress += view.progressPercent;
        if (view.health === 'achieved') achievedCount += 1;
        if (view.health === 'achieved' || view.health === 'on-track') onTrackOrAchievedCount += 1;
        if (items.length <= input.limit && follows(record.position, input.after)) {
          items.push({ view, position: record.position });
        }
      }
    }
    if (candidates.length < batchSize) break;
    after = candidates.at(-1)?.position ?? null;
  }
  const page = items.slice(0, input.limit);
  return {
    items: page.map(({ view }) => view),
    nextPosition: items.length > input.limit ? (page.at(-1)?.position ?? null) : null,
    summary: {
      goalCount,
      expectedProgressPercent,
      averageProgressPercent: goalCount === 0 ? 0 : totalProgress / goalCount,
      onTrackOrAchievedCount,
      achievedCount,
      atRiskOrBehindCount: goalCount - onTrackOrAchievedCount,
    },
  };
}
