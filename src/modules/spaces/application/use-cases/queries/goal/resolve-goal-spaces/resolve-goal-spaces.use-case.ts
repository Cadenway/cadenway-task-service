import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { ResolveGoalSpacesInput } from './resolve-goal-spaces.input.js';
import type { ResolveGoalSpacesOutput } from './resolve-goal-spaces.output.js';

/** Resolves actual space roles for goal visibility within the caller's tenant transaction. */
export class ResolveGoalSpaces {
  // #region Properties
  /** Applies the shared space access policies to batched grant rows. */
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Joins the calling goal operation's transaction. */
  public constructor(private readonly unitOfWork: SpacesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Rechecks roles after taking ordered locks when the caller requests a stable write scope. */
  public async execute(input: ResolveGoalSpacesInput): Promise<ResolveGoalSpacesOutput> {
    const ids = [...new Set(input.spaceIds)];
    if (ids.length === 0) return [];

    const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
    return this.unitOfWork.run(async (store) => {
      let candidates = await store.spaces.findVisibleByIds(input.organizationId, viewer, ids);
      if (input.lock === true && candidates.length > 0) {
        const held = await store.spaces.lockInOrder(
          input.organizationId,
          candidates.map(({ space }) => ({ id: space.snapshot.id, mode: 'update' })),
        );
        candidates = await store.spaces.findVisibleByIds(
          input.organizationId,
          viewer,
          held.map(({ snapshot }) => snapshot.id),
        );
      }
      return candidates.flatMap(({ space, grants }) => {
        const role = this.access.fromGrants(viewer, space.snapshot, null, grants).spaceRole;
        return role === null ? [] : [{ id: space.snapshot.id, role }];
      });
    });
  }
  // #endregion
}
