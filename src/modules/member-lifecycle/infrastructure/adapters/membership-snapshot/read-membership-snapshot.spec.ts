import { Readable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import type { MembershipRebuildItem } from '../../../application/models/membership/membership-rebuild-item.model.js';
import { readMembershipSnapshot } from './read-membership-snapshot.js';

const header = JSON.stringify({ kind: 'header', version: 1 });
const end = JSON.stringify({ kind: 'footer', count: 1 });
const removedAt = '2026-06-01T10:00:00.000Z';
const member = {
  kind: 'membership',
  organizationId: '01938f6e-6d1a-7c3e-9a51-2f0c4b8d7e10',
  memberId: '01938f6e-9000-7000-8000-0000000000c1',
  userId: '01938f6e-8a42-7d5b-b2c9-5e1f3a6d9c24',
  role: 'guest',
  version: 2,
  updatedAt: removedAt,
  removedAt,
};
const line = JSON.stringify(member);

/** Sends raw bytes, as a file or Docker stdin does. */
async function read(...chunks: string[]): Promise<MembershipRebuildItem[]> {
  const items: MembershipRebuildItem[] = [];
  const input = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  for await (const item of readMembershipSnapshot(input)) items.push(item);
  return items;
}

describe('readMembershipSnapshot', () => {
  it('accepts a snapshot with records split across chunks and keeps the tombstone time', async () => {
    const records = await read(
      `${header}\n${line.slice(0, 21)}`,
      `${line.slice(21)}\n`,
      `${end}\n`,
    );
    expect(records).toEqual([
      {
        organizationId: member.organizationId,
        memberId: member.memberId,
        userId: member.userId,
        role: 'guest',
        version: 2,
        removedAt: new Date(removedAt),
        updatedAt: new Date(removedAt),
      },
    ]);
  });

  it.each([
    ['truncation', `${header}\n${line}\n`],
    ['wrong count', `${header}\n${line}\n{"kind":"footer","count":0}\n`],
    ['duplicate generation', `${header}\n${line}\n${line}\n{"kind":"footer","count":2}\n`],
    ['oversized line', `${header}\n${' '.repeat(1_025)}`],
    ['invalid version', `${header}\n${JSON.stringify({ ...member, version: 1 })}\n${end}\n`],
    ['unexpected trailing content', `${header}\n${line}\n${end}\n\n`],
  ])('rejects %s', async (_case, snapshot) => {
    await expect(read(snapshot)).rejects.toThrow(
      'Invalid or incomplete Organization membership snapshot.',
    );
  });
});
