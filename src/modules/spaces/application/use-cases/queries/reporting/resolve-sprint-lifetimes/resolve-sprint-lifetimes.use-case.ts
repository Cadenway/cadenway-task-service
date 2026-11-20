import type { SprintLifetimeCurrent } from '../../../../models/reporting/sprint-lifetime-current.model.js';
import type { SprintLifetimeFact } from '../../../../models/reporting/sprint-lifetime-fact.model.js';
import type { SprintLifetimeInterval } from '../../../../models/reporting/sprint-lifetime-interval.model.js';
import type { SprintLifetimesUnitOfWork } from '../../../../ports/outbound/transactions/reporting/sprint-lifetimes-unit-of-work.port.js';
import type { ResolveSprintLifetimesInput } from './resolve-sprint-lifetimes.input.js';
import type { ResolveSprintLifetimesOutput } from './resolve-sprint-lifetimes.output.js';

/** Orders a late baseline before ordinary writes at the same cutover instant. */
function orderFacts(a: SprintLifetimeFact, b: SprintLifetimeFact, coverage: Date): number {
  const first = a.baseline ? coverage.getTime() : a.recordedAt.getTime();
  const second = b.baseline ? coverage.getTime() : b.recordedAt.getTime();
  if (first !== second) return first - second;
  if (a.baseline !== b.baseline) return a.baseline ? -1 : 1;
  return a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0;
}

/** Reconstructs a readable list's covered and unknown sprint periods. */
function intervals(
  current: SprintLifetimeCurrent,
  facts: readonly SprintLifetimeFact[],
  coverage: Date,
  observedAt: Date,
): { readonly active: SprintLifetimeInterval[]; readonly unknown: SprintLifetimeInterval[] } {
  const active: SprintLifetimeInterval[] = [];
  const unknown: SprintLifetimeInterval[] = [];
  if (current.createdAt > observedAt) return { active, unknown };
  const ordered = [...facts].sort((a, b) => orderFacts(a, b, coverage));
  const first = ordered[0];
  let state: boolean | null = null;
  let start = coverage;

  if (first === undefined && current.unchangedSinceCoverage) {
    start = current.createdAt > coverage ? current.createdAt : coverage;
    state = current.sprintStartDate !== null && current.sprintEndDate !== null;
  } else if (first !== undefined && !first.baseline && current.createdAt > coverage) {
    // No state before creation contributes. A gap after creation stays unknown.
    start = current.createdAt;
  }

  const record = (end: Date | null): void => {
    if (end !== null && end <= start) return;
    if (state === null) unknown.push({ startsAt: start, endsBefore: end });
    else if (state) active.push({ startsAt: start, endsBefore: end });
  };

  for (const fact of ordered) {
    const instant = fact.baseline ? coverage : fact.recordedAt;
    if (instant > observedAt) continue;
    const next =
      fact.spaceId === current.spaceId &&
      fact.sprintStartDate !== null &&
      fact.sprintEndDate !== null &&
      fact.deletedAt === null;
    if (next === state) continue;
    record(instant);
    start = instant < coverage ? coverage : instant;
    state = next;
  }
  record(null);
  return { active, unknown };
}

/** Resolves covered list lifetimes after rechecking the caller's current visibility. */
export class ResolveSprintLifetimes {
  // #region Constructor
  /** Joins the same tenant read used by the report. */
  public constructor(private readonly unitOfWork: SprintLifetimesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Omits inaccessible lists and keeps unknown history separate from known inactive periods. */
  public async execute(input: ResolveSprintLifetimesInput): Promise<ResolveSprintLifetimesOutput> {
    if (input.sprints.length > 5) throw new Error('A sprint report includes at most five lists.');
    const ids = [...new Set(input.sprints.map((sprint) => sprint.listId))];
    if (ids.length !== input.sprints.length) throw new Error('Sprint list IDs must be distinct.');
    const viewer = { userId: input.viewerUserId, role: input.viewerRole };
    return this.unitOfWork.read(async (reader): Promise<ResolveSprintLifetimesOutput> => {
      const lists = await reader.currentLists(input.organizationId, viewer, ids);
      const visible = new Map(lists.map((list) => [list.listId, list]));
      const facts: SprintLifetimeFact[] = [];
      let after: bigint | null = null;
      if (input.coverageStartedAt !== null && ids.length > 0) {
        for (;;) {
          const page = await reader.listFacts(
            input.organizationId,
            viewer,
            ids,
            input.observedAt,
            input.snapshot,
            after,
            500,
          );
          facts.push(...page);
          if (page.length < 500) break;
          const last = page.at(-1)?.sequence;
          if (last === undefined || (after !== null && last <= after)) {
            throw new Error('Sprint list history did not advance.');
          }
          after = last;
        }
      }
      return {
        sprints: input.sprints.flatMap((sprint) => {
          const list = visible.get(sprint.listId);
          if (list?.spaceId !== sprint.spaceId) return [];
          if (input.coverageStartedAt === null) {
            return [{ ...sprint, intervals: [], unknown: [] }];
          }
          const periods = intervals(
            list,
            facts.filter((fact) => fact.listId === sprint.listId),
            input.coverageStartedAt,
            input.observedAt,
          );
          return [{ ...sprint, intervals: periods.active, unknown: periods.unknown }];
        }),
      };
    });
  }
  // #endregion
}
