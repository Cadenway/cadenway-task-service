import { describe, expect, it, vi } from 'vitest';

import { IntakeAttachmentDraft } from '../../../../../domain/aggregates/attachment/intake-attachment-draft.aggregate.js';
import type { ExpiredIntakeDraft } from '../../../../models/attachment/expired-intake-draft.model.js';
import type { ExpireIntakeDrafts } from '../../../../ports/outbound/transactions/attachment/expire-intake-drafts.port.js';
import { ExpireIntakeAttachmentDrafts } from './expire-intake-attachment-drafts.use-case.js';

describe('ExpireIntakeAttachmentDrafts', () => {
  const candidate: ExpiredIntakeDraft = {
    organizationId: '019a5f3c-8d2e-7c4a-9b1f-3e5d7a9c1b2f',
    publicationId: '019a7000-1b2c-7d3e-8f4a-5b6c7d8e9f01',
    draftDigest: 'a'.repeat(64),
  };
  const startedAt = new Date('2026-11-20T14:00:00Z');
  const now = new Date('2026-11-20T15:00:00Z');

  it('processes bounded pages until no candidates remain', async () => {
    const findExpired = vi
      .fn()
      .mockResolvedValueOnce(Array(100).fill(candidate))
      .mockResolvedValueOnce([]);
    const withExpiredDraft = vi.fn().mockResolvedValue(true);
    const purgeTerminalReservations = vi.fn().mockResolvedValue(undefined);
    const subject = new ExpireIntakeAttachmentDrafts(
      { findExpired, withExpiredDraft, purgeTerminalReservations },
      () => now,
    );
    const result = await subject.execute(new AbortController().signal);
    expect(result).toBe(100);
    expect(findExpired).toHaveBeenCalledTimes(2);
    expect(findExpired).toHaveBeenCalledWith(100);
    expect(withExpiredDraft).toHaveBeenCalledTimes(100);
    expect(purgeTerminalReservations).toHaveBeenCalledExactlyOnceWith(500);
  });

  it('records each released decision and closes the draft inside its locked transaction', async () => {
    const draft = IntakeAttachmentDraft.start(candidate, startedAt);
    const reservation = draft.reserve(
      '019a7003-4d5e-7f6a-8b9c-0d1e2f3a4b01',
      0,
      'optional',
      startedAt,
    );
    const listReservations = vi.fn().mockResolvedValue([reservation]);
    const recordDecision = vi.fn().mockResolvedValue(undefined);
    const saveDraft = vi.fn().mockResolvedValue(undefined);
    const withExpiredDraft = vi.fn<ExpireIntakeDrafts['withExpiredDraft']>(
      async (_candidate, decide) => {
        await decide(draft, { listReservations, recordDecision, saveDraft });
        expect(recordDecision).toHaveBeenCalledExactlyOnceWith(reservation.release(draft.snapshot));
        expect(saveDraft).toHaveBeenCalledExactlyOnceWith(draft.close(candidate, now));
        expect(recordDecision).toHaveBeenCalledBefore(saveDraft);
        return true;
      },
    );
    const subject = new ExpireIntakeAttachmentDrafts(
      {
        findExpired: vi.fn().mockResolvedValue([candidate]),
        withExpiredDraft,
        purgeTerminalReservations: vi.fn().mockResolvedValue(undefined),
      },
      () => now,
    );
    await expect(subject.execute(new AbortController().signal)).resolves.toBe(1);
  });

  it('does not repeatedly scan a locked candidate during one run', async () => {
    const findExpired = vi.fn().mockResolvedValue(Array(100).fill(candidate));
    const subject = new ExpireIntakeAttachmentDrafts(
      {
        findExpired,
        withExpiredDraft: vi.fn().mockResolvedValue(false),
        purgeTerminalReservations: vi.fn().mockResolvedValue(undefined),
      },
      () => now,
    );
    const result = await subject.execute(new AbortController().signal);
    expect(result).toBe(0);
    expect(findExpired).toHaveBeenCalledTimes(1);
  });

  it('honours cancellation before selecting work', async () => {
    const controller = new AbortController();
    controller.abort();
    const findExpired = vi.fn();
    const subject = new ExpireIntakeAttachmentDrafts(
      { findExpired, withExpiredDraft: vi.fn(), purgeTerminalReservations: vi.fn() },
      () => now,
    );
    await expect(subject.execute(controller.signal)).rejects.toThrow();
    expect(findExpired).not.toHaveBeenCalled();
  });
});
