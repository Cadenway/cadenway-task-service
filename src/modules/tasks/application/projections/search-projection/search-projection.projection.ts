import type { StatusKey } from '../../../domain/value-objects/task/status-key.value-object.js';

interface ActiveResource {
  // #region Properties
  /** Stable identifier exposed by the source. */
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly lifecycle: 'active';
  // #endregion
}

/** The current searchable fields of an active Task-owned resource. */
export type SearchProjection = ActiveResource &
  (
    | {
        readonly kind: 'task';
        readonly status: StatusKey;
        readonly listId: string;
        readonly spaceId: string;
      }
    | { readonly kind: 'list'; readonly spaceId: string }
    | { readonly kind: 'space' }
  );
