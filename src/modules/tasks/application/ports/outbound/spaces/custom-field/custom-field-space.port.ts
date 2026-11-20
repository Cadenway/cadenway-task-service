import type { Viewer } from '../../../../../domain/value-objects/member/viewer.value-object.js';

/** Space-owned access decision inside the caller's tenant transaction. */
export interface CustomFieldSpacePort {
  // #region Methods
  /** Runs the requested field operation. */
  resolve(
    organizationId: string,
    spaceId: string,
    viewer: Viewer,
    lock: boolean,
  ): Promise<{ readonly canManage: boolean } | null>;
  // #endregion
}
