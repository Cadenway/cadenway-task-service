import { describe, expect, it } from 'vitest';

import { toTaskListPatch } from './task-list-patch.mapper.js';

describe('toTaskListPatch', () => {
  it('maps an empty patch to an empty patch', () => {
    expect(toTaskListPatch({})).toStrictEqual({});
  });

  it('keeps null for the icon and for the sprint, which makes a sprint a list again', () => {
    expect(toTaskListPatch({ icon: null, sprint: null })).toStrictEqual({
      icon: null,
      sprint: null,
    });
  });

  it('leaves the goal of a sprint out when the patch does not name it', () => {
    const patch: ReturnType<typeof toTaskListPatch> = toTaskListPatch({
      sprint: { startDate: '2026-11-18', endDate: '2026-12-01' },
    });

    expect(patch).toStrictEqual({ sprint: { startDate: '2026-11-18', endDate: '2026-12-01' } });
    expect(
      toTaskListPatch({ sprint: { startDate: '2026-11-18', endDate: '2026-12-01', goal: null } }),
    ).toStrictEqual({
      sprint: { startDate: '2026-11-18', endDate: '2026-12-01', goal: null },
    });
  });
});
