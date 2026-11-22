import { memberJoinedV1Schema } from '@cadenway/contracts/events/organization-service';
import { z } from 'zod';

import type { MembershipRebuildItem } from '../../../application/models/membership/membership-rebuild-item.model.js';
import { membershipKey } from '../../../domain/value-objects/membership/membership-position.value-object.js';

const MAX_RECORD_BYTES = 1_024;
const newline = 0x0a;
const canonicalTime = z.iso.datetime({ precision: 3 }).transform((value) => new Date(value));
const record = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('header'), version: z.literal(1) }),
  memberJoinedV1Schema
    .pick({ organizationId: true, memberId: true, userId: true, role: true })
    .extend({
      kind: z.literal('membership'),
      version: z.int().positive(),
      removedAt: canonicalTime.nullable(),
      updatedAt: canonicalTime,
    })
    .strict(),
  z.strictObject({ kind: z.literal('footer'), count: z.int().nonnegative() }),
]);

/** Streams a strict version-1 maintenance snapshot, including its mandatory final tally. */
export async function* readMembershipSnapshot(
  input: AsyncIterable<unknown>,
): AsyncGenerator<MembershipRebuildItem> {
  let previous = '';
  let count = 0;
  let state: 'start' | 'memberships' | 'done' = 'start';
  for await (const line of readLines(input)) {
    const parsed = parse(line);
    if (state === 'start' && parsed.kind === 'header') {
      state = 'memberships';
      continue;
    }
    if (state === 'memberships' && parsed.kind === 'membership') {
      const { organizationId, memberId, userId, role, version, removedAt, updatedAt } = parsed;
      const membership = { organizationId, memberId, userId, role, version, removedAt, updatedAt };
      const key = membershipKey(membership);
      if (
        key <= previous ||
        key !== key.toLowerCase() ||
        membership.userId !== membership.userId.toLowerCase() ||
        (membership.removedAt !== null && (membership.version < 2 || membership.role === 'owner'))
      ) {
        throw invalidSnapshot();
      }
      previous = key;
      count += 1;
      yield membership;
      continue;
    }
    if (state === 'memberships' && parsed.kind === 'footer' && parsed.count === count) {
      state = 'done';
      continue;
    }
    throw invalidSnapshot();
  }
  if (state !== 'done') throw invalidSnapshot();
}

/** Rejects invalid UTF-8 and never accumulates an oversized or unterminated record. */
async function* readLines(input: AsyncIterable<unknown>): AsyncGenerator<string> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let tail: Buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    if (!Buffer.isBuffer(chunk)) throw invalidSnapshot();
    let start = 0;
    for (let end = chunk.indexOf(newline); end !== -1; end = chunk.indexOf(newline, start)) {
      yield decoder.decode(joinRecord(tail, chunk.subarray(start, end)));
      tail = Buffer.alloc(0);
      start = end + 1;
    }
    tail = joinRecord(tail, chunk.subarray(start));
  }
  if (tail.length !== 0) throw invalidSnapshot();
}

function joinRecord(first: Buffer, second: Buffer): Buffer {
  if (first.length + second.length > MAX_RECORD_BYTES) throw invalidSnapshot();
  return first.length === 0 ? second : Buffer.concat([first, second]);
}

function parse(line: string): z.infer<typeof record> {
  try {
    return record.parse(JSON.parse(line) as unknown);
  } catch {
    throw invalidSnapshot();
  }
}

function invalidSnapshot(): Error {
  return new Error('Invalid or incomplete Organization membership snapshot.');
}
