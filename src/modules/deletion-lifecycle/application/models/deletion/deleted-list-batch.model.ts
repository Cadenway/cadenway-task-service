import type { RootPosition } from './root-position.model.js';

/**
 * Type DeletedListBatch
 *
 * @description
 * What one batch of the move of the tasks of a deleted list to the trash did, as the deletion job
 * reads it:
 *
 * - `list-live`: the list (or its space) is no longer deleted, since a restoration from the trash
 *   brought it back: nothing was written, and the job leaves the tasks it has not moved yet live in
 *   the list;
 * - `none-left`: no top-level task and no archive is left in the list; `listPurged` when no task
 *   referenced the list any more, so its tombstone was erased, and `spacePurged` when its deleted
 *   space, left without a list, was erased with it;
 * - `trashed`: the batch made `entries` trash entries, `taskIds` are every task it moved to the
 *   trash (the requests of which the job drops in the same transaction), and the next batch starts
 *   after `last`.
 *
 * @type {{ readonly outcome: 'list-live' } | { readonly outcome: 'none-left'; readonly listPurged: boolean; readonly spacePurged: boolean } | { readonly outcome: 'trashed'; readonly entries: number; readonly taskIds: readonly string[]; readonly last: RootPosition }}
 */
export type DeletedListBatch =
  | { readonly outcome: 'list-live' }
  | {
      readonly outcome: 'none-left';
      readonly listPurged: boolean;
      readonly spacePurged: boolean;
    }
  | {
      readonly outcome: 'trashed';
      readonly entries: number;
      readonly taskIds: readonly string[];
      readonly last: RootPosition;
    };
