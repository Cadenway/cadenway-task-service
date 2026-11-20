/**
 * Type TrashDeletedListTasksOutput
 *
 * @description
 * What one batch of the move to the trash of a deleted list did:
 *
 * - `list-live`: the list is no longer deleted (a restoration brought it back after its job
 *   finished); the batch wrote nothing and the job stops for this list;
 * - `list-gone`: the list is unknown or was erased (its tombstone went with its last entry); the
 *   batch wrote nothing and the job stops for this list, which is gone for good;
 * - `rescan`: no root is left after the position, but the list, held `FOR SHARE` and still
 *   deleted, holds tasks out of the trash (behind the position); the batch wrote nothing and the
 *   job starts the list again from `after: null`;
 * - `none-left`: no root is left after the position, the list, held `FOR SHARE`, is still deleted
 *   and holds no task out of the trash; when no task row references it any more, it was handed to
 *   the spaces module, which erased it (`listPurged`) and its deleted space with its last list
 *   (`spacePurged`);
 * - `trashed`: the entries made (one per root still qualifying under its lock, possibly none), the
 *   ids of every task moved (for their pending access requests: 1,150 live tasks at most, plus the
 *   archived subtasks under them, which the product does not limit), and the position of the last
 *   root examined, where the next batch starts.
 */
export type TrashDeletedListTasksOutput =
  | { readonly outcome: 'list-live' }
  | { readonly outcome: 'list-gone' }
  | { readonly outcome: 'rescan' }
  | { readonly outcome: 'none-left'; readonly listPurged: boolean; readonly spacePurged: boolean }
  | {
      readonly outcome: 'trashed';
      readonly entries: number;
      readonly taskIds: readonly string[];
      readonly last: { readonly createdAt: Date; readonly id: string };
    };
