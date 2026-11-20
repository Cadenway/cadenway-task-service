import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { GetIntakeForm } from './get-intake-form.use-case.js';

const input = { organizationId: 'org', actorUserId: 'actor', listId: 'list' };
const eligibility = {
  allowedStatuses: new Set(['triage', 'todo']),
  eligibleAssignees: new Set<string>(),
};
const access = { role: 'edit' as const, lifecycle: 'active' as const };

function fixture(form: IntakeForm | null) {
  const store = {
    loadEditor: vi
      .fn<IntakeStore['loadEditor']>()
      .mockResolvedValue({ listName: 'Requests', access, eligibility, form }),
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
  return { store, work };
}

describe('GetIntakeForm', () => {
  it('persists version 1 under the editor and list lock', async () => {
    const { store, work } = fixture(null);
    const result = await new GetIntakeForm(work).execute(input);
    expect(result).toMatchObject({ version: 1, defaultStatus: 'triage', publicKey: null });
    expect(store.loadEditor).toHaveBeenCalledWith(input, true);
    expect(store.saveForm).toHaveBeenCalledWith('list', result, null);
    expect(store.reservePublicationKey).not.toHaveBeenCalled();
  });

  it('uses todo when triage is hidden and allows an archived list', async () => {
    const { store, work } = fixture(null);
    store.loadEditor.mockResolvedValue({
      listName: 'Requests',
      access: { role: 'edit', lifecycle: 'archived' },
      eligibility: { ...eligibility, allowedStatuses: new Set(['todo']) },
      form: null,
    });
    const result = await new GetIntakeForm(work).execute(input);
    expect(result.defaultStatus).toBe('todo');
    expect(store.saveForm).toHaveBeenCalledWith('list', result, null);
  });

  it('preserves an already saved draft even when its default later becomes unavailable', async () => {
    const form = IntakeForm.create('Requests', eligibility);
    const { store, work } = fixture(form);
    store.loadEditor.mockResolvedValue({
      listName: 'Renamed list',
      access,
      eligibility: { ...eligibility, allowedStatuses: new Set(['todo']) },
      form,
    });
    const result = await new GetIntakeForm(work).execute(input);
    expect(result).toEqual(form.snapshot());
    expect(result.defaultStatus).toBe('triage');
    expect(store.saveForm).not.toHaveBeenCalled();
  });

  it('denies non-editors before inserting a draft', async () => {
    const { store, work } = fixture(null);
    store.loadEditor.mockResolvedValue({
      listName: 'Requests',
      access: { role: 'view', lifecycle: 'active' },
      eligibility,
      form: null,
    });
    await expect(new GetIntakeForm(work).execute(input)).rejects.toMatchObject({
      role: 'view',
      requiredRole: 'edit',
    });
    expect(store.saveForm).not.toHaveBeenCalled();
  });

  it('saves once when two first reads are serialized by the list settings lock', async () => {
    const { store, work } = fixture(null);
    let form: IntakeForm | null = null;
    store.loadEditor.mockImplementation(() =>
      Promise.resolve({ listName: 'Requests', access, eligibility, form }),
    );
    store.saveForm.mockImplementation((_listId, state) => {
      form = IntakeForm.reconstitute(state);
      return Promise.resolve();
    });
    let pending = Promise.resolve();
    const serialWork: IntakeUnitOfWork = {
      ...work,
      run: async (_organizationId, callback) => {
        const previous = pending;
        let release = (): void => {
          throw new Error('The lock was not initialized.');
        };
        pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback(store);
        } finally {
          release();
        }
      },
    };
    const subject = new GetIntakeForm(serialWork);
    const [first, second] = await Promise.all([subject.execute(input), subject.execute(input)]);
    expect(first).toEqual(second);
    expect(store.saveForm).toHaveBeenCalledOnce();
  });
});
