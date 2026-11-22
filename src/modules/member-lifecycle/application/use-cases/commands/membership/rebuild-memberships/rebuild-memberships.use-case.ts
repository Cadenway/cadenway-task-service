import { membershipKey } from '../../../../../domain/value-objects/membership/membership-position.value-object.js';
import type { MembershipRebuildItem } from '../../../../models/membership/membership-rebuild-item.model.js';
import type { ApplyMemberEventInput } from '../apply-member-event/apply-member-event.input.js';

type ProjectedMembership = Omit<MembershipRebuildItem, 'updatedAt' | 'role'> & {
  readonly role: string;
};

/** Checks the restored projection against Organization, then applies the authoritative state. */
export class RebuildMemberships {
  // #region Constructor
  /** Binds the read-only preflight and the existing, individually atomic lifecycle command. */
  public constructor(
    private readonly inspect: (
      verify: (projection: AsyncIterable<ProjectedMembership>) => Promise<void>,
    ) => Promise<void>,
    private readonly apply: (event: ApplyMemberEventInput) => Promise<void>,
  ) {}
  // #endregion

  // #region Methods
  /** Reads the sealed snapshot twice so incomplete input cannot apply an initial prefix. */
  public async execute(openSnapshot: () => AsyncIterable<MembershipRebuildItem>): Promise<number> {
    await this.inspect((projection) => verifyMembershipRebuild(openSnapshot(), projection));
    let count = 0;
    for await (const row of openSnapshot()) {
      const { organizationId, memberId, userId, role, version, removedAt, updatedAt } = row;
      await this.apply({
        organizationId,
        memberId,
        userId,
        role,
        version,
        kind: removedAt === null ? 'role-changed' : 'removed',
        occurredAt: removedAt ?? updatedAt,
      });
      count += 1;
    }
    return count;
  }
  // #endregion
}

/** Rejects a snapshot older than, or inconsistent with, the Task database it would restore. */
async function verifyMembershipRebuild(
  source: AsyncIterable<MembershipRebuildItem>,
  projection: AsyncIterable<ProjectedMembership>,
): Promise<void> {
  const restored = projection[Symbol.asyncIterator]();
  try {
    let current = await restored.next();
    for await (const membership of source) {
      if (current.done === true) continue;
      const sourceKey = membershipKey(membership);
      const restoredKey = membershipKey(current.value);
      if (sourceKey > restoredKey) {
        throw new Error('The Organization snapshot is missing a Task membership.');
      }
      if (sourceKey < restoredKey) continue;
      assertMembershipHistory(current.value, membership);
      current = await restored.next();
    }
    if (current.done !== true) {
      throw new Error('The Organization snapshot is missing a Task membership.');
    }
  } finally {
    await restored.return?.();
  }
}

/** Already-applied membership generations must belong to the same Organization history. */
function assertMembershipHistory(
  restored: ProjectedMembership,
  source: MembershipRebuildItem,
): void {
  const sourceEnded = source.removedAt !== null;
  const restoredEnded = restored.removedAt !== null;
  if (
    source.userId !== restored.userId ||
    source.version < restored.version ||
    (restoredEnded && !sourceEnded) ||
    (source.version === restored.version &&
      (source.role !== restored.role || sourceEnded !== restoredEnded))
  ) {
    throw new Error('The Organization snapshot and the Task membership history disagree.');
  }
}
