import type { InternalTokenSigner } from '@cadenway/nest-common';
import { describe, expect, it, vi } from 'vitest';

import { OrganizationMembershipAuthority } from './organization-membership-authority.adapter.js';

const organizationId = '01956a7c-273b-79cf-a010-949174963fda';
const userId = '01956a7c-273b-79cf-a011-949174963fda';
const membership = { memberId: '01956a7c-273b-79cf-a012-949174963fda', role: 'member', version: 2 };
const origin = 'http://organization-service:3011';

function fixture(response: Response) {
  const sign = vi.fn<InternalTokenSigner['sign']>().mockResolvedValue('signed-task-fixture');
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
  return {
    sign,
    fetcher,
    authority: new OrganizationMembershipAuthority({ origin, signer: { sign } }, fetcher),
  };
}

describe('OrganizationMembershipAuthority', () => {
  it('signs the user and tenant only for Organization and returns the exact stamp', async () => {
    const { authority, sign, fetcher } = fixture(Response.json(membership));
    await expect(authority.find(organizationId, userId)).resolves.toEqual(membership);
    expect(sign).toHaveBeenCalledExactlyOnceWith('organization-service', {
      organizationId,
      actor: { type: 'user', id: userId },
      scopes: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] ?? [];
    expect(url).toEqual(new URL('/internal/v1/search-membership', origin));
    expect(options?.cache).toBe('no-store');
    expect(options?.redirect).toBe('error');
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer signed-task-fixture');
  });

  it('distinguishes the authority problem for an absent membership', async () => {
    const { authority } = fixture(
      Response.json(
        {
          type: 'https://example.test/organization.not-found',
          title: 'Not Found',
          status: 404,
          code: 'organization.not-found',
        },
        { status: 404, headers: { 'content-type': 'application/problem+json' } },
      ),
    );
    await expect(authority.find(organizationId, userId)).resolves.toBeNull();
  });

  it.each([
    () => new Response(null, { status: 404 }),
    () => new Response(null, { status: 503 }),
    () => Response.json({ ...membership, version: null }),
    () => Response.json({ ...membership, extra: 'x'.repeat(16_384) }),
  ])('treats an invalid, unavailable or oversized response as unavailable', async (response) => {
    const { authority } = fixture(response());
    await expect(authority.find(organizationId, userId)).rejects.toThrow(
      'authority is unavailable',
    );
  });

  it('fails closed when authority is not configured', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      new OrganizationMembershipAuthority(null, fetcher).find(organizationId, userId),
    ).rejects.toThrow('authority is not configured');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
