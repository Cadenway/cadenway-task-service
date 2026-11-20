import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeCleanupUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-cleanup-unit-of-work.port.js';
import { PurgeIntakeContacts } from '../purge-intake-contacts/purge-intake-contacts.use-case.js';
import { PurgeDeletedListIntake } from '../purge-deleted-list-intake/purge-deleted-list-intake.use-case.js';
import { RevokeDeletedListIntake } from './revoke-deleted-list-intake.use-case.js';

const eligibility = {
  allowedStatuses: new Set(['triage', 'todo']),
  eligibleAssignees: new Set<string>(),
};
const access = { role: 'edit' as const, lifecycle: 'active' as const };
const originalKey = 'A'.repeat(43);

function fixture() {
  const current = IntakeForm.create('Sprint 14', eligibility).publish(
    access,
    1,
    eligibility,
    originalKey,
  );
  const store = {
    findForm: vi.fn().mockResolvedValue(current),
    saveForm: vi.fn().mockResolvedValue(undefined),
    deleteContacts: vi
      .fn<(taskIds: readonly string[]) => Promise<void>>()
      .mockResolvedValue(undefined),
    deleteForm: vi.fn().mockResolvedValue(undefined),
  };
  const work: IntakeCleanupUnitOfWork = {
    run: async (_organizationId, action) => action(store),
  };
  return { current, store, work };
}

describe('Intake cleanup', () => {
  it('revokes the existing key exactly once for each deleted list', async () => {
    const { current, store, work } = fixture();
    store.findForm.mockResolvedValueOnce(current).mockResolvedValueOnce(null);
    await new RevokeDeletedListIntake(work).execute({
      organizationId: 'org',
      listIds: ['second', 'first', 'first'],
    });
    expect(store.findForm.mock.calls).toEqual([
      ['first', true],
      ['second', true],
    ]);
    expect(store.saveForm).toHaveBeenCalledWith(
      'first',
      expect.objectContaining({ publicKey: null, version: 3 }),
      2,
    );
    expect(store.saveForm).toHaveBeenCalledTimes(1);
  });

  it('leaves an unpublished draft untouched', async () => {
    const { store, work } = fixture();
    store.findForm.mockResolvedValue(IntakeForm.create('Sprint 14', eligibility));
    await new RevokeDeletedListIntake(work).execute({ organizationId: 'org', listIds: ['first'] });
    expect(store.saveForm).not.toHaveBeenCalled();
  });

  it('deletes large sets of contacts in bounded groups and preserves publication reservations', async () => {
    const { store, work } = fixture();
    const taskIds = Array.from({ length: 1_201 }, (_, index) => String(index));
    await new PurgeIntakeContacts(work).execute({ organizationId: 'org', taskIds });
    expect(store.deleteContacts.mock.calls.map(([ids]) => ids.length)).toEqual([500, 500, 201]);
    await new PurgeDeletedListIntake(work).execute({ organizationId: 'org', listId: 'first' });
    expect(store.deleteForm).toHaveBeenCalledWith('first');
  });
});
