import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { DelegatedMembershipProof } from '../../../../models/membership/delegated-membership-proof.model.js';
import { TaskRefusal } from '../../../../models/task/task-refusal.model.js';
import type { MembershipAuthority } from '../../../../ports/outbound/members/membership/membership-authority.port.js';
import type { MembershipProjection } from '../../../../ports/outbound/members/membership/membership-projection.port.js';

/** Couples current Organization membership to the Task projection and its access grants. */
export class DelegatedMemberships {
  // #region Constructor
  /** Binds the live and transactional membership reads. */
  public constructor(
    private readonly authority: MembershipAuthority,
    private readonly projection: MembershipProjection,
  ) {}
  // #endregion

  // #region Methods
  /** Reads each named account once without holding a database transaction. */
  public async execute(
    organizationId: string,
    userIds: readonly string[],
  ): Promise<DelegatedMembershipProof> {
    const entries = await Promise.all(
      [...new Set(userIds)].map(async (userId) => {
        const stamp = await this.authority.find(organizationId, userId);
        return [userId, stamp] as const;
      }),
    );
    return { organizationId, stamps: new Map(entries) };
  }

  /** Checks that the current transaction sees the same generation and role as Organization. */
  public async confirm(
    proof: DelegatedMembershipProof,
    organizationId: string,
    userId: string,
    lock: boolean,
  ): Promise<Viewer | null> {
    const stamp = proof.stamps.get(userId);
    if (proof.organizationId !== organizationId || stamp === undefined) {
      throw new Error('Current membership was not checked for this tenant and account.');
    }
    if (stamp === null) return null;
    const projected = await this.projection.stampOf(organizationId, userId, lock);
    if (
      projected?.memberId !== stamp.memberId ||
      projected.version !== stamp.version ||
      projected.role !== stamp.role
    ) {
      throw new Error('The membership projection and Organization do not agree.');
    }
    return { userId, role: stamp.role };
  }

  /** Resolves an author or recipient that must still be a member. */
  public async require(
    proof: DelegatedMembershipProof,
    organizationId: string,
    userId: string,
    lock: boolean,
  ): Promise<Viewer> {
    const viewer = await this.confirm(proof, organizationId, userId, lock);
    if (viewer === null) throw new TaskRefusal({ reason: 'organization-not-found' });
    return viewer;
  }
  // #endregion
}
