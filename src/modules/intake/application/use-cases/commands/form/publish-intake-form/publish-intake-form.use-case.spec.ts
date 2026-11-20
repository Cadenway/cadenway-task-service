import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { DisableIntakeForm } from '../disable-intake-form/disable-intake-form.use-case.js';
import { PublishIntakeForm } from './publish-intake-form.use-case.js';

const eligibility = {
  allowedStatuses: new Set(['triage', 'todo']),
  eligibleAssignees: new Set<string>(),
};
const access = { role: 'edit' as const, lifecycle: 'active' as const };
const input = { organizationId: 'org', actorUserId: 'actor', listId: 'list' };
const key = 'A'.repeat(43);

function fixture(form: IntakeForm | null) {
  const store = {
    loadEditor: vi.fn().mockResolvedValue({ access, eligibility, form }),
    saveForm: vi.fn(),
    reservePublicationKey: vi.fn().mockResolvedValue(key),
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
  return { store, work };
}

describe('PublishIntakeForm', () => {
  it('creates and publishes the initial draft with an insert version precondition', async () => {
    const { store, work } = fixture(null);
    await expect(new PublishIntakeForm(work).execute(input)).resolves.toMatchObject({
      version: 2,
      publicKey: key,
    });
    expect(store.saveForm).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({ version: 2, publicKey: key }),
      null,
    );
  });

  it('does not allocate a key or write when publication is unchanged', async () => {
    const form = IntakeForm.create(eligibility).publish(access, 1, eligibility, key);
    const { store, work } = fixture(form);
    await expect(new PublishIntakeForm(work).execute(input)).resolves.toMatchObject({
      version: 2,
      publicKey: key,
    });
    expect(store.reservePublicationKey).not.toHaveBeenCalled();
    expect(store.saveForm).not.toHaveBeenCalled();
  });

  it('reports the effective role and required role when publication is denied', async () => {
    const { store, work } = fixture(null);
    store.loadEditor.mockResolvedValue({
      access: { role: 'view', lifecycle: 'active' },
      eligibility,
      form: null,
    });
    await expect(new PublishIntakeForm(work).execute(input)).rejects.toMatchObject({
      role: 'view',
      requiredRole: 'edit',
    });
    expect(store.saveForm).not.toHaveBeenCalled();
  });

  it('revokes an existing key with the previous version as a precondition', async () => {
    const form = IntakeForm.create(eligibility).publish(access, 1, eligibility, key);
    const { store, work } = fixture(form);
    await expect(new DisableIntakeForm(work).execute(input)).resolves.toEqual({ version: 3 });
    expect(store.saveForm).toHaveBeenCalledWith(
      'list',
      expect.objectContaining({ version: 3, publicKey: null }),
      2,
    );
  });
});
