import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import { SubmitIntakeForm } from './submit-intake-form.use-case.js';

const key = 'A'.repeat(43);
const eligibility = {
  allowedStatuses: new Set(['triage', 'todo']),
  eligibleAssignees: new Set<string>(),
};
const editor = { role: 'edit' as const, lifecycle: 'active' as const };
const form = IntakeForm.create(eligibility).publish(editor, 1, eligibility, key);
const context = { key, lifecycle: 'active' as const, eligibility };
const input = {
  publicKey: key,
  submission: { title: 'Help', contactEmail: 'requester@example.com' },
  idempotencyKey: 'request-1',
  fingerprint: 'body-fingerprint',
};

function fixture() {
  const store = {
    loadEditor: vi.fn(),
    saveForm: vi.fn(),
    reservePublicationKey: vi.fn(),
    loadPublication: vi.fn().mockResolvedValue({ form, context }),
    claimSubmission: vi.fn().mockResolvedValue({ kind: 'acquired' }),
    completeSubmission: vi.fn(),
    createTask: vi.fn().mockResolvedValue('opaque-receipt'),
    readContact: vi.fn(),
  } satisfies IntakeStore;
  const work: IntakeUnitOfWork = {
    resolvePublicKey: vi.fn().mockResolvedValue({ organizationId: 'org', listId: 'list' }),
    run: async (_organizationId, callback) => callback(store),
    read: async (_organizationId, callback) => callback(store),
  };
  return { store, subject: new SubmitIntakeForm(work) };
}

describe('SubmitIntakeForm', () => {
  it('claims before locking the publication and saves the receipt with task creation', async () => {
    const { subject, store } = fixture();
    await expect(subject.execute(input)).resolves.toEqual({ receipt: 'opaque-receipt' });
    expect(store.claimSubmission).toHaveBeenCalledWith(
      'list',
      key,
      'request-1',
      'body-fingerprint',
    );
    expect(vi.mocked(store.claimSubmission).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(store.loadPublication).mock.invocationCallOrder[0] ?? 0,
    );
    expect(store.createTask).toHaveBeenCalledWith('list', {
      task: {
        title: 'Help',
        description: null,
        priority: 'moyenne',
        dueDate: null,
        status: 'triage',
        assigneeId: null,
      },
      contactEmail: 'requester@example.com',
    });
    expect(store.completeSubmission).toHaveBeenCalledWith(
      'list',
      key,
      'request-1',
      'body-fingerprint',
      'opaque-receipt',
    );
  });

  it('returns an in-progress refusal without waiting on the publication lock', async () => {
    const { subject, store } = fixture();
    vi.mocked(store.claimSubmission).mockResolvedValue({ kind: 'in-progress' });
    await expect(subject.execute(input)).rejects.toMatchObject({ reason: 'in-progress' });
    expect(store.loadPublication).toHaveBeenCalledWith('list', key, false);
    expect(store.createTask).not.toHaveBeenCalled();
  });

  it('conceals a publication revoked while a matching submission is in progress', async () => {
    const { subject, store } = fixture();
    vi.mocked(store.claimSubmission).mockResolvedValue({ kind: 'in-progress' });
    vi.mocked(store.loadPublication).mockResolvedValue(null);
    await expect(subject.execute(input)).rejects.toMatchObject({
      failure: { kind: 'unavailable' },
    });
    expect(store.loadPublication).toHaveBeenCalledWith('list', key, false);
    expect(store.createTask).not.toHaveBeenCalled();
  });

  it('does not replay a receipt after the publication becomes unavailable', async () => {
    const { subject, store } = fixture();
    vi.mocked(store.claimSubmission).mockResolvedValue({ kind: 'replay', receipt: 'old' });
    vi.mocked(store.loadPublication).mockResolvedValue(null);
    await expect(subject.execute(input)).rejects.toMatchObject({
      failure: { kind: 'unavailable' },
    });
    expect(store.createTask).not.toHaveBeenCalled();
  });

  it('replays the original receipt only after checking the active publication', async () => {
    const { subject, store } = fixture();
    vi.mocked(store.claimSubmission).mockResolvedValue({ kind: 'replay', receipt: 'old' });
    await expect(subject.execute(input)).resolves.toEqual({ receipt: 'old' });
    expect(store.loadPublication).toHaveBeenCalledWith('list', key, true);
    expect(store.createTask).not.toHaveBeenCalled();
    expect(store.completeSubmission).not.toHaveBeenCalled();
  });

  it('does not create or retain a receipt when task creation fails', async () => {
    const { subject, store } = fixture();
    vi.mocked(store.createTask).mockRejectedValue(new Error('write failed'));
    await expect(subject.execute(input)).rejects.toThrow('write failed');
    expect(store.completeSubmission).not.toHaveBeenCalled();
  });
});
