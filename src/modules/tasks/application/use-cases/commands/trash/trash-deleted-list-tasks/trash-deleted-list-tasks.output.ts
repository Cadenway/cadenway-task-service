/**
 * Type TrashDeletedListTasksOutput
 *
 * @description
 * What one batch of the move to the trash of a deleted list did:
 *
 * - `list-live`: the list is no longer deleted (a restoration brought it back) or is gone; the
 *   batch wrote nothing and the job stops for this list;
 * - `none-left`: no root is left after the position and the list, held `FOR SHARE`, is still
 *   deleted; when no task row references it any more, it was handed to the spaces module, which
 *   erased it (`listPurged`) and its deleted space with its last list (`spacePurged`);
 * - `trashed`: the entries made (one per root still qualifying under its lock, possibly none), the
 *   ids of every task moved (for their pending access requests: 1,150 live tasks at most, plus the
 *   archived subtasks under them, which the product does not limit), and the position of the last
 *   root examined, where the next batch starts.
 */
export type TrashDeletedListTasksOutput =
  | { readonly outcome: 'list-live' }
  | { readonly outcome: 'none-left'; readonly listPurged: boolean; readonly spacePurged: boolean }
  | {
      readonly outcome: 'trashed';
      readonly entries: number;
      readonly taskIds: readonly string[];
      readonly last: { readonly createdAt: Date; readonly id: string };
    };
