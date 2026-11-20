import { describe, expect, it, vi } from 'vitest';

import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import type { IntakeAttachmentStore } from '../../../../ports/outbound/persistence/attachment/intake-attachment-store.port.js';
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

function fixture(clock: () => Date = () => new Date('2026-11-20T14:01:00Z')) {
  const draft = IntakeAttachmentDraft.start(
    {
      organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
      publicationId: '019a7000-1b2c-7d3e-8f4a-5b6c7d8e9f01',
      draftDigest: 'a'.repeat(64),
    },
    new Date('2026-11-20T14:00:00Z'),
  );
  const attachments = {
    startDraft: vi.fn(),
    loadDraft: vi.fn().mockResolvedValue(draft),
    findReservationClaim: vi.fn(),
    newAttachmentId: vi.fn(),
    listReservations: vi.fn().mockResolvedValue([]),
    insertReservation: vi.fn(),
    findReservation: vi.fn(),
    findByIdentity: vi.fn(),
    saveReservation: vi.fn(),
    recordDecision: vi.fn<IntakeAttachmentStore['recordDecision']>(),
    saveDraft: vi.fn(),
    createTask: vi.fn().mockResolvedValue({ receipt: 'opaque-receipt', taskKey: 'CAD-482' }),
  } satisfies IntakeAttachmentStore;
  const store = {
    attachments,
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
  return {
    store,
    attachments,
    draft,
    subject: new SubmitIntakeForm(work, clock),
  };
}

describe('SubmitIntakeForm', () => {
  it('aborts the transaction if the draft expires while the task is being created', async () => {
    let now = new Date('2026-11-20T14:01:00Z');
    const { subject, attachments, draft, store } = fixture(() => now);
    const id = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
    const reserved = draft.reserve(id, 0, 'optional', now);
    attachments.listReservations.mockResolvedValue([reserved.verify(reserved.snapshot, now)]);
    attachments.createTask.mockImplementationOnce(() => {
      now = new Date('2026-11-20T14:30:00Z');
      return Promise.resolve({ receipt: 'opaque-receipt', taskKey: 'CAD-482' });
    });
    await expect(
      subject.execute({
        ...input,
        draftKey: 'B'.repeat(43),
        submission: { ...input.submission, attachmentIds: [id] },
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    expect(attachments.recordDecision).not.toHaveBeenCalled();
    expect(store.completeSubmission).not.toHaveBeenCalled();
  });

  it('commits a verified claim and releases the unused slot with the receipt', async () => {
    const { subject, attachments, draft, store } = fixture();
    const at = new Date('2026-11-20T14:01:00Z');
    const firstId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
    const secondId = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f15';
    const first = draft.reserve(firstId, 0, 'optional', at);
    const verified = first.verify(first.snapshot, at);
    const unused = draft.reserve(secondId, 1, 'optional', at);
    attachments.listReservations.mockResolvedValue([verified, unused]);

    await expect(
      subject.execute({
        ...input,
        draftKey: 'B'.repeat(43),
        submission: { ...input.submission, attachmentIds: [firstId] },
      }),
    ).resolves.toEqual({ receipt: 'opaque-receipt' });
    expect(attachments.recordDecision).toHaveBeenCalledTimes(2);
    expect(attachments.recordDecision.mock.calls[0]?.[0].decision).toMatchObject({
      kind: 'claimed',
      attachmentId: firstId,
      taskKey: 'CAD-482',
    });
    expect(attachments.recordDecision.mock.calls[1]?.[0].decision).toMatchObject({
      kind: 'released',
      attachmentId: secondId,
    });
    expect(attachments.saveDraft).toHaveBeenCalledOnce();
    expect(store.completeSubmission).toHaveBeenCalledOnce();
  });

  it('does not create a task when the selected reservation is awaiting verification', async () => {
    const { subject, attachments, draft, store } = fixture();
    const id = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
    attachments.listReservations.mockResolvedValue([
      draft.reserve(id, 0, 'optional', new Date('2026-11-20T14:01:00Z')),
    ]);
    await expect(
      subject.execute({
        ...input,
        draftKey: 'B'.repeat(43),
        submission: { ...input.submission, attachmentIds: [id] },
      }),
    ).rejects.toMatchObject({ failure: 'upload-not-ready' });
    expect(attachments.createTask).not.toHaveBeenCalled();
    expect(store.completeSubmission).not.toHaveBeenCalled();
  });

  it('does not complete the receipt if recording a claim fails', async () => {
    const { subject, attachments, draft, store } = fixture();
    const id = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
    const now = new Date('2026-11-20T14:01:00Z');
    const reservation = draft.reserve(id, 0, 'optional', now);
    attachments.listReservations.mockResolvedValue([reservation.verify(reservation.snapshot, now)]);
    attachments.recordDecision.mockRejectedValueOnce(new Error('Outbox unavailable'));
    await expect(
      subject.execute({
        ...input,
        draftKey: 'B'.repeat(43),
        submission: { ...input.submission, attachmentIds: [id] },
      }),
    ).rejects.toThrow('Outbox unavailable');
    expect(store.completeSubmission).not.toHaveBeenCalled();
  });

  it('replays the receipt before looking up the already closed draft', async () => {
    const { subject, attachments, store } = fixture();
    vi.mocked(store.claimSubmission).mockResolvedValue({ kind: 'replay', receipt: 'old' });
    await expect(subject.execute({ ...input, draftKey: 'B'.repeat(43) })).resolves.toEqual({
      receipt: 'old',
    });
    expect(attachments.loadDraft).not.toHaveBeenCalled();
  });
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
