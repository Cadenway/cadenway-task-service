import { describe, expect, it, vi } from 'vitest';

import type { GoalsStore } from '../../models/goal/goals-store.model.js';
import { requireVisibleTargets } from './goal-access.service.js';

describe('locked goal target authorization', () => {
  it('reports a hidden goal before revealing whether a target exists', async () => {
    const findScope = vi.fn().mockResolvedValue(null);
    const store = {
      measureLinks: vi.fn().mockResolvedValue({ lists: new Map(), milestones: new Map() }),
      findScope,
    } as unknown as GoalsStore;
    const viewer = { organizationId: 'org', userId: 'user', role: 'member' as const };

    await expect(
      requireVisibleTargets(
        store,
        viewer,
        [{ kind: 'milestone', label: 'Jalon', taskKey: 'CAD-482' }],
        'result-target-invalid',
        true,
        'space',
        'missing-goal',
      ),
    ).rejects.toMatchObject({ failure: { reason: 'missing-goal' } });
    expect(findScope).toHaveBeenCalledWith(viewer, 'space', false);
  });
});
