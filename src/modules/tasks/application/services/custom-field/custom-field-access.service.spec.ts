import { describe, expect, it, vi } from 'vitest';

import type { SpaceDirectory } from '../../ports/outbound/spaces/space/space-directory.port.js';
import { CustomFieldAccess } from './custom-field-access.service.js';

const actor = { organizationId: 'organization', actorUserId: 'actor' };

function fixture() {
  const roleOf = vi.fn().mockResolvedValue('member');
  const resolve = vi.fn().mockResolvedValue({ canManage: true });
  const findVisibleList = vi.fn().mockResolvedValue({ list: { spaceId: 'space' } });
  const access = new CustomFieldAccess({ roleOf }, { resolve }, {
    findVisibleList,
  } as unknown as SpaceDirectory);
  return { roleOf, resolve, findVisibleList, access };
}

describe('CustomFieldAccess', () => {
  it('holds membership and space and requires actual management for writes', async () => {
    const { access, roleOf, resolve } = fixture();
    await access.space(actor, 'space', 'write');
    expect(roleOf).toHaveBeenCalledWith('organization', 'actor', true);
    expect(resolve).toHaveBeenCalledWith(
      'organization',
      'space',
      { userId: 'actor', role: 'member' },
      true,
    );
    resolve.mockResolvedValueOnce({ canManage: false });
    await expect(access.space(actor, 'space', 'write')).rejects.toMatchObject({
      reason: 'manage-forbidden',
    });
    resolve.mockResolvedValueOnce(null);
    await expect(access.space(actor, 'hidden', 'write')).rejects.toMatchObject({
      refusal: { reason: 'space-not-found' },
    });
  });

  it('previews current management without holding the membership or space lock', async () => {
    const { access, roleOf, resolve } = fixture();
    await access.space(actor, 'space', 'preview-write');
    expect(roleOf).toHaveBeenCalledWith('organization', 'actor', false);
    expect(resolve).toHaveBeenCalledWith(
      'organization',
      'space',
      { userId: 'actor', role: 'member' },
      false,
    );
    resolve.mockResolvedValueOnce({ canManage: false });
    await expect(access.space(actor, 'space', 'preview-write')).rejects.toMatchObject({
      reason: 'manage-forbidden',
    });
  });

  it('allows definitions to be read with a list-only grant and checks membership first', async () => {
    const { access, roleOf, resolve, findVisibleList } = fixture();
    await expect(access.list(actor, 'list')).resolves.toBe('space');
    expect(resolve).not.toHaveBeenCalled();
    expect(findVisibleList).toHaveBeenCalledWith(
      'organization',
      { userId: 'actor', role: 'member' },
      'list',
    );
    roleOf.mockResolvedValueOnce(null);
    await expect(access.list(actor, 'list')).rejects.toMatchObject({
      refusal: { reason: 'organization-not-found' },
    });
    expect(findVisibleList).toHaveBeenCalledTimes(1);
  });
});
