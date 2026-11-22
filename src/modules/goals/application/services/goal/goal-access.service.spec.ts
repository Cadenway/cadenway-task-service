import { describe, expect, it, vi } from 'vitest';

import type { GoalsStore } from '../../models/goal/goals-store.model.js';
import { requireScope, requireVisibleTargets } from './goal-access.service.js';

describe('organization goal visibility', () => {
  const store = {} as GoalsStore;
  const guest = { organizationId: 'org', userId: 'user', role: 'guest' as const };

  it('hides an existing organization goal from guest writes', async () => {
    await expect(requireScope(store, guest, null, true, 'missing-goal')).rejects.toMatchObject({
      failure: { reason: 'missing-goal' },
    });
  });

  it('preserves the role error for guest organization goal creation', async () => {
    await expect(requireScope(store, guest, null, true, 'missing-space')).rejects.toMatchObject({
      failure: { reason: 'organization-role-forbidden' },
    });
  });
});

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
