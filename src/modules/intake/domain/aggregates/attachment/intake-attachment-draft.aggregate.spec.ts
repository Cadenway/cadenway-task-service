import { describe, expect, it } from 'vitest';
import { IntakeAttachmentError } from '../../errors/attachment/intake-attachment.error.js';
import { requireIntakeAttachmentDeclarationSize } from '../../policies/attachment/require-intake-attachment-declaration-size.policy.js';
import { normalizeIntakeAttachmentIds } from '../../policies/submission/normalize-intake-attachment-ids.policy.js';
import { planIntakeAttachmentClaims } from '../../policies/submission/plan-intake-attachment-claims.policy.js';
import { IntakeAttachmentDraft } from './intake-attachment-draft.aggregate.js';
import { IntakeAttachmentReservation } from './intake-attachment-reservation.aggregate.js';

const binding = {
  organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
  publicationId: '019a7000-1b2c-7d3e-8f4a-5b6c7d8e9f01',
  draftDigest: 'a'.repeat(64),
};
const attachmentId = '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01';
const secondId = '019a7004-3b2c-7d4e-8f5a-6b7c8d9e0f15';
const foreignId = '019a7005-6f7a-7b8c-9d0e-1f2a3b4c5d33';
const startedAt = new Date('2026-11-20T14:00:00Z');
const later = new Date('2026-11-20T14:12:00Z');
const expiresAt = new Date('2026-11-20T14:30:00Z');

function start(): IntakeAttachmentDraft {
  return IntakeAttachmentDraft.start(binding, startedAt);
}

describe('IntakeAttachmentDraft', () => {
  it('accepts the 25 MiB boundary and refuses larger or invalid file sizes', () => {
    expect(() => {
      requireIntakeAttachmentDeclarationSize(25 * 1024 * 1024);
    }).not.toThrow();
    expect(() => {
      requireIntakeAttachmentDeclarationSize(25 * 1024 * 1024 + 1);
    }).toThrow(expect.objectContaining({ failure: 'file-too-large' }));
    expect(() => {
      requireIntakeAttachmentDeclarationSize(0);
    }).toThrow(expect.objectContaining({ failure: 'invalid-declaration' }));
  });

  it('holds at most five active slots under a fixed expiry set by the first reservation', () => {
    const draft = start();
    const first = draft.reserve(attachmentId, 0, undefined, startedAt);
    const fifth = draft.reserve(secondId, 4, 'required', later);

    expect(draft.snapshot.expiresAt).toEqual(expiresAt);
    expect(first.snapshot).toEqual({
      ...binding,
      attachmentId,
      expiresAt,
      status: 'reserved',
      taskKey: null,
    });
    expect(fifth.snapshot.expiresAt).toEqual(expiresAt);
    expect(() => draft.reserve(foreignId, 5, 'optional', later)).toThrow(
      expect.objectContaining({ failure: 'limit-exceeded' }),
    );
    expect(() => draft.reserve(foreignId, 2, 'disabled', later)).toThrow(
      expect.objectContaining({ failure: 'disabled' }),
    );
    expect(() => draft.reserve(foreignId, 2, 'optional', expiresAt)).toThrow(
      expect.objectContaining({ failure: 'unavailable' }),
    );
  });

  it('requires the exact organization, publication and SHA-256 draft digest', () => {
    const draft = start();
    const foreignBindings = [
      { ...binding, organizationId: binding.publicationId },
      { ...binding, publicationId: binding.organizationId },
      { ...binding, draftDigest: 'b'.repeat(64) },
    ];

    for (const foreign of foreignBindings) {
      expect(() => {
        draft.requireOpen(foreign, later);
      }).toThrow(expect.objectContaining({ failure: 'unavailable' }));
    }
    expect(() =>
      IntakeAttachmentDraft.start({ ...binding, draftDigest: 'A'.repeat(43) }, startedAt),
    ).toThrow(IntakeAttachmentError);
  });

  it('does not expose a mutable copy of its lease or reopen a closed draft', () => {
    const draft = start();
    const reserved = draft.reserve(attachmentId, 0, 'optional', startedAt);
    draft.snapshot.expiresAt.setTime(0);
    reserved.snapshot.expiresAt.setTime(0);
    const closed = draft.close(binding, expiresAt);

    expect(draft.snapshot.expiresAt).toEqual(expiresAt);
    expect(reserved.snapshot.expiresAt).toEqual(expiresAt);
    expect(closed.snapshot.closedAt).toEqual(expiresAt);
    expect(closed.close(binding, expiresAt)).toBe(closed);
    expect(() => {
      closed.requireOpen(binding, later);
    }).toThrow(expect.objectContaining({ failure: 'unavailable' }));
  });
});

describe('IntakeAttachmentReservation', () => {
  it('claims once after verification and keeps the same immutable decision on replay', () => {
    const reserved = start().reserve(attachmentId, 0, 'optional', startedAt);
    const fact = { ...binding, attachmentId };
    expect(() => reserved.claim(binding, 'CAD-482', later)).toThrow(
      expect.objectContaining({ failure: 'upload-not-ready' }),
    );
    const verified = reserved.verify(fact, later);
    const claimed = verified.claim(binding, 'CAD-482', later);

    expect(verified.snapshot.status).toBe('verified');
    expect(verified.verify(fact, later)).toBe(verified);
    expect(claimed.snapshot.status).toBe('claimed');
    expect(claimed.snapshot.taskKey).toBe('CAD-482');
    expect(claimed.decision).toEqual({
      kind: 'claimed',
      organizationId: binding.organizationId,
      publicationId: binding.publicationId,
      attachmentId,
      taskKey: 'CAD-482',
    });
    expect(IntakeAttachmentReservation.restore(claimed.snapshot).decision).toBeUndefined();
    expect(claimed.claim(binding, 'CAD-482', expiresAt)).toBe(claimed);
    expect(claimed.verify(fact, later)).toBe(claimed);
    expect(() => claimed.release(binding)).toThrow(
      expect.objectContaining({ failure: 'unavailable' }),
    );
    expect(() => claimed.claim(binding, 'CAD-483', later)).toThrow(
      expect.objectContaining({ failure: 'unavailable' }),
    );
  });

  it('releases verified and unverified slots and ignores late verification for dead slots', () => {
    const reserved = start().reserve(attachmentId, 0, 'optional', startedAt);
    const fact = { ...binding, attachmentId };
    expect(reserved.verify(fact, expiresAt)).toBe(reserved);
    const verified = reserved.verify(fact, later);

    for (const slot of [reserved, verified]) {
      const released = slot.release(binding);
      expect(released.snapshot.status).toBe('released');
      expect(released.decision).toEqual({
        kind: 'released',
        organizationId: binding.organizationId,
        publicationId: binding.publicationId,
        attachmentId,
      });
      expect(released.release(binding)).toBe(released);
      expect(released.verify(fact, later)).toBe(released);
      expect(() => released.claim(binding, 'CAD-482', later)).toThrow(
        expect.objectContaining({ failure: 'unavailable' }),
      );
    }
  });

  it('cannot change a reservation using a foreign verification fact or draft', () => {
    const reserved = start().reserve(attachmentId, 0, 'optional', startedAt);
    expect(() => reserved.verify({ ...binding, attachmentId: foreignId }, later)).toThrow(
      expect.objectContaining({ failure: 'unavailable' }),
    );
    expect(() => reserved.release({ ...binding, draftDigest: 'b'.repeat(64) })).toThrow(
      expect.objectContaining({ failure: 'unavailable' }),
    );
    expect(() =>
      IntakeAttachmentReservation.restore({ ...reserved.snapshot, status: 'claimed' }),
    ).toThrow(IntakeAttachmentError);
  });
});

describe('intake attachment selection', () => {
  it('canonicalizes UUIDv7 case and ordering and refuses invalid or duplicate selections', () => {
    expect(normalizeIntakeAttachmentIds([secondId, attachmentId.toUpperCase()])).toEqual([
      attachmentId,
      secondId,
    ]);
    for (const ids of [[attachmentId, attachmentId.toUpperCase()], ['bogus']]) {
      expect(() => normalizeIntakeAttachmentIds(ids)).toThrow(
        expect.objectContaining({
          failure: {
            kind: 'invalid-submission',
            issues: [{ field: 'attachmentIds', reason: 'invalid' }],
          },
        }),
      );
    }
  });

  it('plans the selected claims and unused releases only when the selection belongs to the draft', () => {
    const draft = start();
    const first = draft.reserve(attachmentId, 0, 'optional', startedAt);
    const second = draft.reserve(secondId, 1, 'optional', startedAt);
    const verified = first.verify({ ...binding, attachmentId }, later);

    expect(
      planIntakeAttachmentClaims(draft, binding, [attachmentId], [verified, second], later),
    ).toEqual({ selected: [verified], unused: [second] });
    expect(planIntakeAttachmentClaims(draft, binding, [], [verified, second], later)).toEqual({
      selected: [],
      unused: [verified, second],
    });
    expect(() =>
      planIntakeAttachmentClaims(draft, binding, [secondId], [verified, second], later),
    ).toThrow(expect.objectContaining({ failure: 'upload-not-ready' }));
    expect(() =>
      planIntakeAttachmentClaims(draft, binding, [secondId, foreignId], [verified, second], later),
    ).toThrow(expect.objectContaining({ failure: 'unavailable' }));
  });
});
