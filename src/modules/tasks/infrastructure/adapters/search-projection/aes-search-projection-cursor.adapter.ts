import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { SearchProjectionBounds } from '../../../application/models/search-projection/search-projection-bounds.model.js';
import type { SearchProjectionScope } from '../../../application/models/search-projection/search-projection-scope.model.js';
import type { SearchProjectionCursor } from '../../../application/ports/outbound/pagination/search-projection/search-projection-cursor.port.js';

const nonceBytes = 12;
const tagBytes = 16;
const boundsBytes = 2 * 36 + 1;
const cursorBytes = nonceBytes + boundsBytes + tagBytes;
const cursorLength = Math.ceil((cursorBytes * 4) / 3);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function authenticatedScope(organizationId: string, scope: SearchProjectionScope): Buffer {
  return Buffer.from(
    JSON.stringify([
      'task-search-projection/v1',
      organizationId,
      scope.kind,
      scope.spaceId,
      scope.listId,
    ]),
  );
}

function validBounds(afterId: string, upperId: string): boolean {
  // PostgreSQL orders UUID bytes the same way these fixed-width canonical strings are ordered.
  return uuid.test(afterId) && uuid.test(upperId) && afterId < upperId;
}

/** Keeps internal row UUIDs opaque and authenticates their export scope. */
export class AesSearchProjectionCursor implements SearchProjectionCursor {
  // #region Properties
  /** Copy of the shared key scoped to this cursor codec. */
  private readonly key: Buffer;
  // #endregion

  // #region Constructor
  /** Accepts a stable AES-256 key shared by the producer replicas. */
  public constructor(key: Uint8Array) {
    if (key.byteLength !== 32) throw new RangeError('Projection cursors require a 32-byte key.');
    this.key = Buffer.from(key);
  }
  // #endregion

  // #region Methods
  /** Seals the continuation to the tenant, kind and filters. */
  public encode(
    organizationId: string,
    scope: SearchProjectionScope,
    bounds: SearchProjectionBounds,
  ): string {
    if (!validBounds(bounds.afterId, bounds.upperId)) throw new Error('Invalid projection bounds.');
    const nonce = randomBytes(nonceBytes);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: tagBytes });
    cipher.setAAD(authenticatedScope(organizationId, scope));
    const sealed = Buffer.concat([
      nonce,
      cipher.update(`${bounds.afterId}:${bounds.upperId}`, 'utf8'),
      cipher.final(),
      cipher.getAuthTag(),
    ]);
    return sealed.toString('base64url');
  }

  /** Rejects noncanonical, cross-scope and unauthenticated continuations. */
  public decode(
    organizationId: string,
    scope: SearchProjectionScope,
    cursor: string,
  ): SearchProjectionBounds | null {
    if (cursor.length !== cursorLength || !/^[A-Za-z0-9_-]+$/u.test(cursor)) return null;
    const sealed = Buffer.from(cursor, 'base64url');
    if (sealed.length !== cursorBytes || sealed.toString('base64url') !== cursor) return null;

    const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.subarray(0, nonceBytes), {
      authTagLength: tagBytes,
    });
    const tagOffset = nonceBytes + boundsBytes;
    decipher.setAAD(authenticatedScope(organizationId, scope));
    decipher.setAuthTag(sealed.subarray(tagOffset));

    let plain: string;
    try {
      plain = Buffer.concat([
        decipher.update(sealed.subarray(nonceBytes, tagOffset)),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
    const [afterId, upperId] = plain.split(':');
    return afterId !== undefined && upperId !== undefined && validBounds(afterId, upperId)
      ? { afterId, upperId }
      : null;
  }
  // #endregion
}
