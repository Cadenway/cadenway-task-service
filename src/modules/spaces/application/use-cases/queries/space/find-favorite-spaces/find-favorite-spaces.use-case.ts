import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';
import type { SpacesUnitOfWork } from '../../../../ports/outbound/transactions/space/spaces-unit-of-work.port.js';
import { AccessResolver } from '../../../../services/access/access-resolver.service.js';
import type { FindFavoriteSpacesInput } from './find-favorite-spaces.input.js';
import type { FindFavoriteSpacesOutput } from './find-favorite-spaces.output.js';

/** Reads the active space targets visible to the favorites owner. */
export class FindFavoriteSpaces {
  // #region Properties
  /** Applies the normal visibility rules when a target is held for a write. */
  private readonly access = new AccessResolver();
  // #endregion

  // #region Constructor
  /** Takes the Spaces transaction port so it joins the caller's work. */
  public constructor(private readonly unitOfWork: SpacesUnitOfWork) {}
  // #endregion

  // #region Methods
  /** Checks normal visibility before taking any lock and rechecks it under the write lock. */
  public async execute(input: FindFavoriteSpacesInput): Promise<FindFavoriteSpacesOutput> {
    const ids = [...new Set(input.spaceIds)];
    if (ids.length === 0) {
      return [];
    }

    const viewer: Viewer = { userId: input.viewerUserId, role: input.viewerRole };
    return this.unitOfWork.run(async (store): Promise<FindFavoriteSpacesOutput> => {
      const eligible = await store.spaces.findVisibleByIds(input.organizationId, viewer, ids);
      if (input.lock !== true) {
        return eligible.map(({ space }) => ({ id: space.snapshot.id, name: space.snapshot.name }));
      }

      // A list grant can be the sole access to a space. List-grant changes hold its space FOR SHARE.
      const held = await store.spaces.lockInOrder(
        input.organizationId,
        eligible.map(({ space }) => ({ id: space.snapshot.id, mode: 'update' })),
      );
      const visible: { id: string; name: string }[] = [];
      for (const { snapshot } of held) {
        const access = await this.access.resolve(store.grants, viewer, snapshot, null);
        if (access.seesSpace) {
          visible.push({ id: snapshot.id, name: snapshot.name });
        }
      }
      return visible;
    });
  }
  // #endregion
}
