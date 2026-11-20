import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { UpdateIntakeForm } from './update-intake-form.use-case.js';

describe('UpdateIntakeForm', () => {
  it('keeps the version when the existing assignee UUID is sent in uppercase', async () => {
    const assigneeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const eligibility = {
      allowedStatuses: new Set(['triage']),
      eligibleAssignees: new Set([assigneeId]),
    };
    const access = { role: 'edit' as const, lifecycle: 'active' as const };
    const form = IntakeForm.create(eligibility).configure(
      access,
      1,
      { defaultAssigneeId: assigneeId },
      eligibility,
    );
    const store = {
      loadEditor: vi.fn<IntakeStore['loadEditor']>().mockResolvedValue({
        access,
        eligibility,
        form,
      }),
      saveForm: vi.fn<IntakeStore['saveForm']>(),
      reservePublicationKey: vi.fn(),
      loadPublication: vi.fn(),
      claimSubmission: vi.fn(),
      completeSubmission: vi.fn(),
      createTask: vi.fn(),
      readContact: vi.fn(),
    } satisfies IntakeStore;
    const work: IntakeUnitOfWork = {
      resolvePublicKey: vi.fn(),
      run: async (_organizationId, callback) => callback(store),
      read: async (_organizationId, callback) => callback(store),
    };
    const input = {
      organizationId: 'org',
      actorUserId: 'actor',
      listId: 'list',
      expectedVersion: form.snapshot().version,
      patch: { defaultAssigneeId: assigneeId.toUpperCase() },
    };

    await expect(new UpdateIntakeForm(work).execute(input)).resolves.toEqual(form.snapshot());
    expect(store.loadEditor).toHaveBeenCalledWith(input, true, assigneeId);
    expect(store.saveForm).not.toHaveBeenCalled();
  });
});
