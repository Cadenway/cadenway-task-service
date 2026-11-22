import { GetSearchMembershipInternalResponse } from '@cadenway/contracts/validators/internal/organization-service';
import type { InternalTokenSigner } from '@cadenway/nest-common';
import { assertNoActiveTransaction } from '@cadenway/nest-common/database';
import { z } from 'zod';

import type { MembershipStamp } from '../../../application/models/membership/membership-stamp.model.js';

const noMembership = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  status: z.literal(404),
  code: z.literal('organization.not-found'),
});

interface Connection {
  // #region Properties
  /** Operator-supplied Organization origin. */
  readonly origin: string;

  /** Task's own outbound internal signer. */
  readonly signer: Pick<InternalTokenSigner, 'sign'>;
  // #endregion
}

/** Reads Organization's current signed-actor membership without caching. */
export class OrganizationMembershipAuthority {
  // #region Constructor
  /** Binds the one trusted Organization origin and the dedicated Task identity. */
  public constructor(
    private readonly connection: Connection | null,
    private readonly transport: typeof fetch = globalThis.fetch,
  ) {}
  // #endregion

  // #region Methods
  /** Returns null only when the authority explicitly proves membership is absent. */
  public async find(organizationId: string, userId: string): Promise<MembershipStamp | null> {
    assertNoActiveTransaction();
    if (this.connection === null) {
      throw new Error('Current membership authority is not configured.');
    }
    const { origin, signer } = this.connection;
    try {
      const token = await signer.sign('organization-service', {
        organizationId,
        actor: { type: 'user', id: userId },
        scopes: [],
      });
      const response = await this.transport(new URL('/internal/v1/search-membership', origin), {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json, application/problem+json',
        },
        signal: AbortSignal.timeout(1_000),
        redirect: 'error',
        cache: 'no-store',
      });
      const mediaType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (response.status === 200 && mediaType === 'application/json') {
        return GetSearchMembershipInternalResponse.parse(await readBody(response));
      }
      if (response.status === 404 && mediaType === 'application/problem+json') {
        noMembership.parse(await readBody(response));
        return null;
      }
      void response.body?.cancel().catch(() => undefined);
    } catch {
      // Upstream and signing errors can contain credential or response data.
    }
    throw new Error('Current membership authority is unavailable.');
  }
  // #endregion
}

/** Caps the size of the tiny proof or problem before parsing it. */
async function readBody(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error('Missing proof response.');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        return JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)),
        ) as unknown;
      }
      length += result.value.byteLength;
      if (length > 16 * 1024) throw new Error('Proof response is too large.');
      chunks.push(result.value);
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
