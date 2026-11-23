import type { InternalPrincipal } from '@cadenway/nest-common';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { currentMembershipCheck } from './current-membership.js';

const organizationId = '01956a7c-273b-79cf-a010-949174963fda';
const userId = '01956a7c-273b-79cf-a011-949174963fda';

function contextFor(issuer: string): ExecutionContext {
  const internalPrincipal: InternalPrincipal = {
    issuer,
    audience: 'task-service',
    traceId: null,
    organizationId,
    actor: { type: 'user', id: userId },
    role: null,
    scopes: [],
  };
  return {
    switchToHttp: () => ({ getRequest: () => ({ internalPrincipal }) }),
  } as unknown as ExecutionContext;
}

describe('currentMembershipCheck', () => {
  it.each([
    ['document-service', 'task.document-space-access-unavailable'],
    ['api-gateway', 'http.service-unavailable'],
  ])('reports an unavailable authority to %s without exposing its error', async (issuer, code) => {
    const execute = vi.fn().mockRejectedValue(new Error('Unavailable authority fixture'));
    await expect(currentMembershipCheck({ execute })(contextFor(issuer))).rejects.toMatchObject({
      problem: { status: 503, code },
    });
    expect(execute).toHaveBeenCalledExactlyOnceWith(organizationId, userId);
  });

  it('distinguishes membership absence from an unavailable authority', async () => {
    const execute = vi.fn().mockResolvedValue(null);
    await expect(
      currentMembershipCheck({ execute })(contextFor('api-gateway')),
    ).rejects.toMatchObject({ problem: { status: 404, code: 'organization.not-found' } });
  });
});
