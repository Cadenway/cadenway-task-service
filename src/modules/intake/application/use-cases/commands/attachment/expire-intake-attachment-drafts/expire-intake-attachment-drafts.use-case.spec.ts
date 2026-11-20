import { describe, expect, it, vi } from 'vitest';

import type { ExpiredIntakeDraft } from '../../../../models/attachment/expired-intake-draft.model.js';
import { ExpireIntakeAttachmentDrafts } from './expire-intake-attachment-drafts.use-case.js';

describe('ExpireIntakeAttachmentDrafts', () => {
  const candidate: ExpiredIntakeDraft = {
    organizationId: 'organization',
    publicationId: 'publication',
    draftDigest: 'digest',
  };

  it('processes bounded pages until no candidates remain', async () => {
    const findExpired = vi
      .fn()
      .mockResolvedValueOnce(Array(100).fill(candidate))
      .mockResolvedValueOnce([]);
    const expire = vi.fn().mockResolvedValue(true);
    const result = await new ExpireIntakeAttachmentDrafts({ findExpired, expire }).execute(
      new AbortController().signal,
    );
    expect(result).toBe(100);
    expect(findExpired).toHaveBeenCalledTimes(2);
    expect(findExpired).toHaveBeenCalledWith(100);
    expect(expire).toHaveBeenCalledTimes(100);
  });

  it('does not repeatedly scan a locked candidate during one run', async () => {
    const findExpired = vi.fn().mockResolvedValue(Array(100).fill(candidate));
    const expire = vi.fn().mockResolvedValue(false);
    const result = await new ExpireIntakeAttachmentDrafts({ findExpired, expire }).execute(
      new AbortController().signal,
    );
    expect(result).toBe(0);
    expect(findExpired).toHaveBeenCalledTimes(1);
  });

  it('honours cancellation before selecting work', async () => {
    const controller = new AbortController();
    controller.abort();
    const findExpired = vi.fn();
    const expire = vi.fn();
    await expect(
      new ExpireIntakeAttachmentDrafts({ findExpired, expire }).execute(controller.signal),
    ).rejects.toThrow();
    expect(findExpired).not.toHaveBeenCalled();
  });
});
