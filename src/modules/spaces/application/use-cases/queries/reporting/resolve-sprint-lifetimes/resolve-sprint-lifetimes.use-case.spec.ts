import { describe, expect, it, vi } from 'vitest';

import type { SprintLifetimeCurrent } from '../../../../models/reporting/sprint-lifetime-current.model.js';
import type { SprintLifetimeFact } from '../../../../models/reporting/sprint-lifetime-fact.model.js';
import type { SprintLifetimeReader } from '../../../../ports/outbound/persistence/reporting/sprint-lifetime-reader.port.js';
import { ResolveSprintLifetimes } from './resolve-sprint-lifetimes.use-case.js';

const coverage = new Date('2026-11-01T00:00:00Z');
const observedAt = new Date('2026-11-20T00:00:00Z');
const sprint = {
  listId: 'list-1',
  spaceId: 'space-1',
  name: 'Sprint 14',
  startDate: '2026-11-03',
  endDate: '2026-11-17',
};
const input = {
  organizationId: 'org-1',
  viewerUserId: 'user-1',
  viewerRole: 'member' as const,
  coverageStartedAt: coverage,
  observedAt,
  snapshot: '42:43:',
  sprints: [sprint],
};
const current: SprintLifetimeCurrent = {
  listId: sprint.listId,
  spaceId: sprint.spaceId,
  sprintStartDate: sprint.startDate,
  sprintEndDate: sprint.endDate,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  unchangedSinceCoverage: false,
};
const fact = (
  sequence: bigint,
  recordedAt: string,
  baseline: boolean,
  deletedAt: Date | null,
  sprintStartDate: string | null = sprint.startDate,
): SprintLifetimeFact => ({
  sequence,
  listId: sprint.listId,
  spaceId: sprint.spaceId,
  sprintStartDate,
  sprintEndDate: sprintStartDate === null ? null : sprint.endDate,
  deletedAt,
  recordedAt: new Date(recordedAt),
  baseline,
});

function setup(lists: readonly SprintLifetimeCurrent[], facts: readonly SprintLifetimeFact[]) {
  const currentLists = vi.fn().mockResolvedValue(lists);
  const listFacts = vi.fn().mockResolvedValue(facts);
  const reader: SprintLifetimeReader = {
    currentLists,
    listFacts,
  };
  return {
    currentLists,
    listFacts,
    useCase: new ResolveSprintLifetimes({ read: (work) => work(reader) }),
  };
}

describe('ResolveSprintLifetimes', () => {
  it('uses a late baseline at cutover and records deletion and restoration as half-open periods', async () => {
    const deleted = new Date('2026-11-09T10:00:00Z');
    const restored = new Date('2026-11-11T10:00:00Z');
    const { useCase, currentLists, listFacts } = setup(
      [current],
      [
        fact(8n, '2026-11-23T00:00:00Z', true, null),
        fact(3n, deleted.toISOString(), false, deleted),
        fact(5n, restored.toISOString(), false, null),
      ],
    );
    const result = await useCase.execute(input);
    expect(result.sprints[0]).toMatchObject({
      intervals: [
        { startsAt: coverage, endsBefore: deleted },
        { startsAt: restored, endsBefore: null },
      ],
      unknown: [],
    });
    expect(currentLists).toHaveBeenCalledWith('org-1', { userId: 'user-1', role: 'member' }, [
      'list-1',
    ]);
    expect(listFacts).toHaveBeenCalledWith(
      'org-1',
      { userId: 'user-1', role: 'member' },
      ['list-1'],
      observedAt,
      input.snapshot,
      null,
      500,
    );
  });

  it('leaves a missing baseline unknown and tracks later conversion to and from sprint', async () => {
    const created = new Date('2026-11-03T12:00:00Z');
    const converted = new Date('2026-11-05T10:00:00Z');
    const reverted = new Date('2026-11-09T10:00:00Z');
    const { useCase } = setup(
      [{ ...current, createdAt: created }],
      [
        fact(1n, converted.toISOString(), false, null),
        fact(2n, reverted.toISOString(), false, null, null),
      ],
    );
    const result = await useCase.execute(input);
    expect(result.sprints[0]).toMatchObject({
      intervals: [{ startsAt: converted, endsBefore: reverted }],
      unknown: [{ startsAt: created, endsBefore: converted }],
    });
  });

  it('uses an unchanged current row only since coverage or creation', async () => {
    const createdAt = new Date('2026-11-07T00:00:00Z');
    const { useCase } = setup([{ ...current, createdAt, unchangedSinceCoverage: true }], []);
    const result = await useCase.execute(input);
    expect(result.sprints[0]).toMatchObject({
      intervals: [{ startsAt: createdAt, endsBefore: null }],
      unknown: [],
    });
  });

  it('omits lists no longer visible and avoids history reads when coverage is absent', async () => {
    const { useCase, listFacts } = setup([], []);
    expect(await useCase.execute({ ...input, coverageStartedAt: null })).toEqual({ sprints: [] });
    expect(listFacts).not.toHaveBeenCalled();
  });

  it('pages history by sequence and rejects non-advancing pages', async () => {
    const page = Array.from({ length: 500 }, (_, index) =>
      fact(BigInt(index + 1), '2026-11-02T00:00:00Z', false, null),
    );
    const { useCase, listFacts } = setup([current], page);
    await expect(useCase.execute(input)).rejects.toThrow('Sprint list history did not advance.');
    expect(listFacts).toHaveBeenCalledTimes(2);
  });
});
