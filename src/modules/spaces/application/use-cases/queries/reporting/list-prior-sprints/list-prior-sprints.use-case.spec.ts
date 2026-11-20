import { describe, expect, it, vi } from 'vitest';

import type { PriorSprintReader } from '../../../../ports/outbound/persistence/reporting/prior-sprint-reader.port.js';
import { ListPriorSprints } from './list-prior-sprints.use-case.js';

describe('ListPriorSprints', () => {
  const input = {
    organizationId: 'organization',
    viewerUserId: 'member',
    viewerRole: 'guest' as const,
    spaceId: 'space',
    beforeStartDate: '2026-11-03',
    completedThroughDate: '2026-10-31',
  };

  it('selects within the report snapshot and presents the returned sprints oldest first', async () => {
    const newest = {
      listId: 'b',
      name: 'Beta',
      startDate: '2026-10-19',
      endDate: '2026-10-31',
    };
    const oldest = {
      listId: 'a',
      name: 'Alpha',
      startDate: '2026-10-19',
      endDate: '2026-10-31',
    };
    const listVisibleCompleted = vi.fn().mockResolvedValue([newest, oldest]);
    const reader: PriorSprintReader = { listVisibleCompleted };
    const transaction = vi.fn(async (work: (reader: PriorSprintReader) => Promise<unknown>) =>
      work(reader),
    );
    const operation = new ListPriorSprints({
      read: (work) => transaction(work) as ReturnType<typeof work>,
    });

    await expect(operation.execute(input)).resolves.toEqual({ sprints: [oldest, newest] });
    expect(transaction).toHaveBeenCalledOnce();
    expect(listVisibleCompleted).toHaveBeenCalledWith(
      'organization',
      'space',
      { userId: 'member', role: 'guest' },
      '2026-11-03',
      '2026-10-31',
    );
  });

  it('returns no sprint when no completed local date can be represented', async () => {
    const read = vi.fn();
    const operation = new ListPriorSprints({ read });

    await expect(operation.execute({ ...input, completedThroughDate: null })).resolves.toEqual({
      sprints: [],
    });
    expect(read).not.toHaveBeenCalled();
  });
});
