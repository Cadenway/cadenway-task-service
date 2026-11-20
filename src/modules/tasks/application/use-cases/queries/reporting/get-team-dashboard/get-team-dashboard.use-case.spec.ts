import { describe, expect, it, vi } from 'vitest';

import type { MemberDirectory } from '../../../../ports/outbound/members/membership/member-directory.port.js';
import type { ReportingReader } from '../../../../ports/outbound/persistence/reporting/reporting-reader.port.js';
import type { SpaceDirectory } from '../../../../ports/outbound/spaces/space/space-directory.port.js';
import type { ReportingUnitOfWork } from '../../../../ports/outbound/transactions/reporting/reporting-unit-of-work.port.js';
import { GetTeamDashboard } from './get-team-dashboard.use-case.js';

describe('GetTeamDashboard', () => {
  it('limits task and completion reads to visible lists and a safe time boundary', async () => {
    const readTasks = vi.fn().mockResolvedValue({ items: [], next: null });
    const readTransitions = vi.fn().mockResolvedValue({ items: [], next: null });
    const reader = {
      dashboardTasks: readTasks,
      dashboardTransitions: readTransitions,
    } as unknown as ReportingReader;
    const work: ReportingUnitOfWork = { runReadOnly: async (fn) => fn(reader) };
    const members = { roleOf: vi.fn().mockResolvedValue('member') } as unknown as MemberDirectory;
    const spaces = {
      visibleListIds: vi.fn().mockResolvedValue(['visible']),
    } as unknown as SpaceDirectory;
    const now = new Date('2026-11-06T10:00:00Z');
    const result = await new GetTeamDashboard(work, members, spaces, () => now).execute({
      organizationId: 'org',
      actorUserId: 'actor',
      today: '2026-11-06',
      timeZone: 'Europe/Paris',
      weeks: 8,
    });
    expect(result.completions).toHaveLength(8);
    expect(readTasks).toHaveBeenCalledWith('org', ['visible'], null, 500);
    expect(readTransitions).toHaveBeenCalledWith(
      'org',
      ['visible'],
      new Date('2026-09-13T00:00:00.000Z'),
      now,
      null,
      500,
    );
  });
});
