import { rethrowGoalFailure } from '../../../../services/goal/goal-failure.service.js';
import { GoalQuarter } from '../../../../../domain/value-objects/goal/goal-quarter.value-object.js';
import type { GoalPageSummary } from '../../../../models/goal/goal-page-summary.model.js';
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
      .read(async (store) => {
        const viewer = await requireViewer(store, input, false);
        const summary = await summarize(store, viewer, input);
        const records = await visiblePage(store, viewer, input);
        const hasMore = records.length > input.limit;
        const page = records.slice(0, input.limit);
        const links = await store.measureLinks(
          viewer,
          page.flatMap((record) => record.goal.snapshot.results),
          false,
        );
        const items = page.map((record) => projectGoal(record.goal, input.today, links));
        return {
          items,
          nextPosition: hasMore ? (page.at(-1)?.position ?? null) : null,
          summary,
        };
      })
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
  const visible = await store.visibleSpaces(viewer, spaceIds);
  return candidates.filter(({ goal }) =>
    goal.snapshot.spaceId === null ? viewer.role !== 'guest' : visible.has(goal.snapshot.spaceId),
  );
}

/** Measures all currently visible goals in the requested quarter with bounded memory. */
async function summarize(
  store: GoalsStore,
  viewer: GoalViewer,
  input: ListGoalsInput,
): Promise<GoalPageSummary> {
  let after: GoalPosition | null = null;
  let goalCount = 0;
  let totalProgress = 0;
  let onTrackOrAchievedCount = 0;
  let achievedCount = 0;
  let atRiskOrBehindCount = 0;
  for (;;) {
    const candidates = await store.goals.listCandidates(
      viewer.organizationId,
      input.quarter,
      after,
      batchSize,
    );
    if (candidates.length === 0) break;
    const visible = await visibleBatch(store, viewer, candidates);
    const links = await store.measureLinks(
      viewer,
      visible.flatMap((record) => record.goal.snapshot.results),
      false,
    );
    for (const record of visible) {
      const goal: GoalView = projectGoal(record.goal, input.today, links);
      goalCount += 1;
      totalProgress += goal.progressPercent;
      if (goal.health === 'achieved') achievedCount += 1;
      if (goal.health === 'achieved' || goal.health === 'on-track') onTrackOrAchievedCount += 1;
      else atRiskOrBehindCount += 1;
    }
    if (candidates.length < batchSize) break;
    after = candidates[candidates.length - 1]?.position ?? null;
  }
  return {
    goalCount,
    expectedProgressPercent: GoalQuarter.parse(input.quarter).expectedProgress(input.today),
    averageProgressPercent: goalCount === 0 ? 0 : totalProgress / goalCount,
    onTrackOrAchievedCount,
    achievedCount,
    atRiskOrBehindCount,
  };
}

/** Continues beyond hidden candidates until the requested visible page is full. */
async function visiblePage(
  store: GoalsStore,
  viewer: GoalViewer,
  input: ListGoalsInput,
): Promise<readonly GoalRecord[]> {
  let after = input.after;
  const records: GoalRecord[] = [];
  while (records.length <= input.limit) {
    const candidates = await store.goals.listCandidates(
      viewer.organizationId,
      input.quarter,
      after,
      batchSize,
    );
    if (candidates.length === 0) break;
    const visible = await visibleBatch(store, viewer, candidates);
    records.push(...visible.slice(0, input.limit + 1 - records.length));
    if (candidates.length < batchSize) break;
    after = candidates[candidates.length - 1]?.position ?? null;
  }
  return records;
}
