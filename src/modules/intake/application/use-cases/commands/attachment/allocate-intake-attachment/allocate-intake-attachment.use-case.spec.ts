import { describe, expect, it, vi } from 'vitest';

import { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import { IntakeForm } from '../../../../../domain/aggregates/form/intake-form.aggregate.js';
import type { IntakeAttachmentStore } from '../../../../ports/outbound/persistence/attachment/intake-attachment-store.port.js';
import type { IntakeUnitOfWork } from '../../../../ports/outbound/transactions/form/intake-unit-of-work.port.js';
import type { IntakeStore } from '../../../../models/form/intake-store.model.js';
import { AllocateIntakeAttachment } from './allocate-intake-attachment.use-case.js';
import { ReleaseIntakeAttachment } from '../release-intake-attachment/release-intake-attachment.use-case.js';
import { VerifyIntakeAttachment } from '../verify-intake-attachment/verify-intake-attachment.use-case.js';
import { ResolveIntakeAttachment } from '../../../queries/attachment/resolve-intake-attachment/resolve-intake-attachment.use-case.js';

const now = new Date('2026-11-20T14:00:00Z');
const binding = {
  organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
  publicationId: '019a7000-1b2c-7d3e-8f4a-5b6c7d8e9f01',
  draftDigest: 'a'.repeat(64),
};
const id = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const key = 'A'.repeat(43);
const eligibility = {
  allowedStatuses: new Set(['triage', 'todo']),
  eligibleAssignees: new Set<string>(),
};
const form = IntakeForm.create(eligibility).publish(
  { role: 'edit', lifecycle: 'active' },
  1,
  eligibility,
  key,
);
const input = {
  publicKey: key,
  draftKey: 'B'.repeat(43),
  idempotencyKey: 'request-1',
  declaration: { fileName: 'capture.png', contentType: 'image/png', sizeBytes: 1024 },
};

function fixture() {
  const draft = IntakeAttachmentDraft.start(binding, now);
  const attachments = {
    startDraft: vi.fn().mockResolvedValue(draft),
    loadDraft: vi.fn(),
    findReservationClaim: vi.fn().mockResolvedValue(null),
    newAttachmentId: vi.fn().mockResolvedValue(id),
    listReservations: vi.fn().mockResolvedValue([]),
    insertReservation: vi.fn().mockResolvedValue(undefined),
    findReservation: vi.fn(),
    findByIdentity: vi.fn(),
    saveReservation: vi.fn(),
    recordDecision: vi.fn(),
    saveDraft: vi.fn(),
    createTask: vi.fn(),
  } satisfies IntakeAttachmentStore;
  const store = {
    attachments,
    loadEditor: vi.fn(),
    saveForm: vi.fn(),
    reservePublicationKey: vi.fn(),
    loadPublication: vi
      .fn()
      .mockResolvedValue({ form, context: { key, lifecycle: 'active', eligibility } }),
    claimSubmission: vi.fn(),
    completeSubmission: vi.fn(),
    createTask: vi.fn(),
    readContact: vi.fn(),
  } satisfies IntakeStore;
  const work: IntakeUnitOfWork = {
    resolvePublicKey: vi
      .fn()
      .mockResolvedValue({ organizationId: binding.organizationId, listId: 'list' }),
    run: async (_organizationId, callback) => callback(store),
    read: async (_organizationId, callback) => callback(store),
  };
  return {
    attachments,
    draft,
    store,
    work,
    subject: new AllocateIntakeAttachment(work, () => now),
  };
}

describe('AllocateIntakeAttachment', () => {
  it('allocates within the publication transaction with the original deadline', async () => {
    const { subject, attachments } = fixture();
    await expect(subject.execute(input)).resolves.toEqual({
      organizationId: binding.organizationId,
      publicationId: binding.publicationId,
      attachmentId: id,
      expiresAt: new Date('2026-11-20T14:30:00Z'),
    });
    expect(attachments.insertReservation).toHaveBeenCalledOnce();
  });

  it('returns the prior allocation without creating another slot', async () => {
    const { subject, attachments, draft } = fixture();
    const reservation = draft.reserve(id, 0, 'optional', now);
    attachments.findReservationClaim.mockResolvedValue({
      declaration: input.declaration,
      reservation,
    });
    await expect(subject.execute(input)).resolves.toMatchObject({ attachmentId: id });
    expect(attachments.insertReservation).not.toHaveBeenCalled();
  });

  it('refuses a changed declaration for the same idempotency key', async () => {
    const { subject, attachments, draft } = fixture();
    attachments.findReservationClaim.mockResolvedValue({
      declaration: { ...input.declaration, sizeBytes: 1025 },
      reservation: draft.reserve(id, 0, 'optional', now),
    });
    await expect(subject.execute(input)).rejects.toMatchObject({
      failure: 'idempotency-key-reused',
    });
    expect(attachments.insertReservation).not.toHaveBeenCalled();
  });

  it('refuses an oversized declaration before opening a draft', async () => {
    const { subject, attachments } = fixture();
    await expect(
      subject.execute({ ...input, declaration: { ...input.declaration, sizeBytes: 26_214_401 } }),
    ).rejects.toMatchObject({ failure: 'file-too-large' });
    expect(attachments.startDraft).not.toHaveBeenCalled();
  });
});

describe('intake reservation ownership and terminal decisions', () => {
  it('resolves only a reservation of the eligible draft without exposing verification state', async () => {
    const { attachments, draft, work } = fixture();
    attachments.loadDraft.mockResolvedValue(draft);
    attachments.findReservation.mockResolvedValue(draft.reserve(id, 0, 'optional', now));
    const subject = new ResolveIntakeAttachment(work, () => now);
    await expect(
      subject.execute({ publicKey: key, draftKey: input.draftKey, attachmentId: id }),
    ).resolves.toEqual({
      organizationId: binding.organizationId,
      publicationId: binding.publicationId,
      attachmentId: id,
      expiresAt: new Date('2026-11-20T14:30:00Z'),
    });
    expect(attachments.saveReservation).not.toHaveBeenCalled();
  });

  it('conceals an unrelated draft before reading a reservation', async () => {
    const { attachments, work } = fixture();
    attachments.loadDraft.mockResolvedValue(null);
    await expect(
      new ResolveIntakeAttachment(work, () => now).execute({
        publicKey: key,
        draftKey: input.draftKey,
        attachmentId: id,
      }),
    ).rejects.toMatchObject({ failure: 'unavailable' });
    expect(attachments.findReservation).not.toHaveBeenCalled();
  });

  it('records one release and leaves a repeated release unchanged', async () => {
    const { attachments, draft, work } = fixture();
    const reserved = draft.reserve(id, 0, 'optional', now);
    attachments.loadDraft.mockResolvedValue(draft);
    attachments.findReservation
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce(reserved.release(draft.snapshot));
    const subject = new ReleaseIntakeAttachment(work, () => now);
    const request = { publicKey: key, draftKey: input.draftKey, attachmentId: id };
    await expect(subject.execute(request)).resolves.toBeUndefined();
    await expect(subject.execute(request)).resolves.toBeUndefined();
    expect(attachments.recordDecision).toHaveBeenCalledOnce();
  });

  it('accepts a Storage verification once and ignores its duplicate', async () => {
    const { attachments, draft, work } = fixture();
    const reserved = draft.reserve(id, 0, 'optional', now);
    const fact = {
      organizationId: binding.organizationId,
      publicationId: binding.publicationId,
      attachmentId: id,
    };
    attachments.findByIdentity
      .mockResolvedValueOnce(reserved)
      .mockResolvedValueOnce(reserved.verify(fact, now));
    const subject = new VerifyIntakeAttachment(work, () => now);
    await expect(subject.execute(fact)).resolves.toBe(true);
    await expect(subject.execute(fact)).resolves.toBe(false);
    expect(attachments.saveReservation).toHaveBeenCalledOnce();
  });
});
