import { InvalidTaskError } from '../../errors/task/invalid-task.error.js';
import type { SprintHistoryInput } from '../../value-objects/reporting/sprint-history-input.value-object.js';
import type { SprintReportTaskSnapshot } from '../../value-objects/reporting/sprint-report-task-snapshot.value-object.js';
import { sprintTaskPoints } from './sprint-report.policy.js';

type TaskFact = SprintHistoryInput['taskFacts'][number];
type FieldFact = SprintHistoryInput['fieldFacts'][number];
type ValueFact = SprintHistoryInput['valueFacts'][number];
type FactPosition = Pick<TaskFact, 'recordedAt' | 'sequence' | 'baseline'>;
type CurrentRow = Pick<
  SprintHistoryInput['currentTasks'][number],
  'createdAt' | 'unchangedSinceCoverage'
>;
type TimedFact<Fact> = readonly [time: number, fact: Fact];
type Timelines<Fact> = Map<string, TimedFact<Fact>[]>;

/** Orders captured states by effective time and sequence, with the baseline first at activation. */
function timelineOrder<Fact extends FactPosition>(
  left: TimedFact<Fact>,
  right: TimedFact<Fact>,
): number {
  const [leftTime, leftFact] = left;
  const [rightTime, rightFact] = right;
  if (leftTime !== rightTime) return leftTime - rightTime;
  if (leftFact.baseline !== rightFact.baseline) return leftFact.baseline ? -1 : 1;
  if (leftFact.sequence === rightFact.sequence) return 0;
  return leftFact.sequence < rightFact.sequence ? -1 : 1;
}

/** Builds timelines for the bounded candidate batch once, for reuse at all report cutoffs. */
function indexFacts<Fact extends FactPosition>(
  facts: readonly Fact[],
  coverage: number | null,
  keyOf: (fact: Fact) => string,
): Timelines<Fact> {
  const timelines: Timelines<Fact> = new Map();
  if (coverage === null) return timelines;
  for (const fact of facts) {
    const time = fact.baseline ? coverage : fact.recordedAt.getTime();
    if (!Number.isFinite(time)) {
      throw new InvalidTaskError('a sprint history fact has a valid recording time');
    }
    if (time < coverage) continue;

    const key = keyOf(fact);
    const timeline = timelines.get(key);
    if (timeline) timeline.push([time, fact]);
    else timelines.set(key, [[time, fact]]);
  }
  for (const timeline of timelines.values()) timeline.sort(timelineOrder);
  return timelines;
}

/** Finds the latest state at or before the cutoff in one ordered timeline. */
function latestAt<Fact>(
  timeline: readonly TimedFact<Fact>[] | undefined,
  cutoff: number,
): Fact | undefined {
  if (!timeline) return undefined;
  let lower = 0;
  let upper = timeline.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const item = timeline[middle];
    if (item && item[0] <= cutoff) lower = middle + 1;
    else upper = middle;
  }
  return timeline[lower - 1]?.[1];
}

/** Resolves an existing row at a cutoff; undefined means it was absent and null means a gap. */
function stateAt<Current extends CurrentRow, Fact>(
  current: Current,
  timeline: readonly TimedFact<Fact>[] | undefined,
  coverage: number,
  cutoff: number,
): Current | Fact | null | undefined {
  const created = current.createdAt.getTime();
  if (!Number.isFinite(created)) {
    throw new InvalidTaskError('a current sprint history row has a valid creation time');
  }
  if (created > cutoff) return undefined;

  const fact = latestAt(timeline, cutoff);
  if (fact) return fact;
  if (created >= coverage) return undefined;
  return timeline === undefined && current.unchangedSinceCoverage ? current : null;
}

/** Keys numeric values by the two persisted UUIDs. */
function valueKey(state: Pick<ValueFact, 'taskId' | 'fieldId'>): string {
  return `${state.taskId}/${state.fieldId}`;
}

/**
 * Reconstructs Sprint 14-style reports for the P3c-2 historical coverage rule. The caller owns
 * current visibility and physical purge filtering before supplying task identities.
 */
export class SprintHistory {
  // #region Properties
  /** Global activation cutoff for lazy baselines, in milliseconds. */
  private readonly coverage: number | null;

  /** The task state histories indexed by task ID. */
  private readonly tasks: Timelines<TaskFact>;

  /** The field state histories indexed by field ID. */
  private readonly fields: Timelines<FieldFact>;

  /** The numeric value histories indexed by task and field IDs. */
  private readonly values: Timelines<ValueFact>;

  /** Sparse current numeric values proved to predate activation without changes. */
  private readonly unchangedValues: ReadonlyMap<string, number | null>;
  // #endregion

  // #region Constructor
  /** Indexes the caller-owned batch so all of its observations use the same facts. */
  public constructor(private readonly input: SprintHistoryInput) {
    this.coverage = input.coverageStartedAt?.getTime() ?? null;
    if (this.coverage !== null && !Number.isFinite(this.coverage)) {
      throw new InvalidTaskError('sprint history starts at a valid time');
    }
    this.tasks = indexFacts(input.taskFacts, this.coverage, (fact) => fact.taskId);
    this.fields = indexFacts(input.fieldFacts, this.coverage, (fact) => fact.fieldId);
    this.values = indexFacts(input.valueFacts, this.coverage, valueKey);
    this.unchangedValues = new Map(
      input.currentValues
        .filter((value) => value.unchangedSinceCoverage)
        .map((value) => [valueKey(value), value.numberValue]),
    );
  }
  // #endregion

  // #region Methods
  /** Returns the covered sprint task scope or null if the cutoff cannot be reconstructed. */
  public at(
    sprint: { readonly listId: string; readonly spaceId: string },
    cutoff: Date,
  ): Iterable<SprintReportTaskSnapshot> | null {
    const time = cutoff.getTime();
    if (!Number.isFinite(time)) {
      throw new InvalidTaskError('a sprint history cutoff is a valid time');
    }
    if (this.coverage === null || time < this.coverage) return null;
    const fieldId = this.designatedFieldAt(sprint.spaceId, this.coverage, time);

    const snapshots: SprintReportTaskSnapshot[] = [];
    for (const current of this.input.currentTasks) {
      const state = stateAt(current, this.tasks.get(current.taskId), this.coverage, time);
      if (state === null) return null;
      if (
        state?.listId !== sprint.listId ||
        state.spaceId !== sprint.spaceId ||
        state.parentId !== null
      ) {
        continue;
      }
      const snapshot: SprintReportTaskSnapshot = {
        key: current.key,
        name: state.name,
        status: state.status,
        parentKey: null,
        milestone: state.milestone,
        archived: state.archivedAt !== null,
        trashed: state.trashEntryId !== null,
        estimateMinutes: state.estimateMinutes,
        customPoints: fieldId ? this.numericValueAt(current.taskId, fieldId, time) : null,
      };
      // A designation gap affects a metric only if an eligible task could use the field.
      if (fieldId === undefined && sprintTaskPoints(snapshot) !== null) return null;
      snapshots.push(snapshot);
    }
    return snapshots;
  }

  /** Resolves an active designation, a known absence or undefined for a coverage gap. */
  private designatedFieldAt(
    spaceId: string,
    coverage: number,
    cutoff: number,
  ): string | null | undefined {
    let selected: string | null = null;
    for (const current of this.input.currentFields) {
      if (current.spaceId !== spaceId) continue;
      const field = stateAt(current, this.fields.get(current.fieldId), coverage, cutoff);
      if (field === null) return undefined;
      if (!field?.designated || field.retiredAt !== null) continue;
      if (selected !== null) return undefined;
      selected = field.fieldId;
    }
    return selected;
  }

  /** Reads a numeric value without replacing a tombstone or future write with live state. */
  private numericValueAt(taskId: string, fieldId: string, cutoff: number): number | null {
    const key = valueKey({ taskId, fieldId });
    const timeline = this.values.get(key);
    if (!timeline) return this.unchangedValues.get(key) ?? null;
    return latestAt(timeline, cutoff)?.numberValue ?? null;
  }
  // #endregion
}
