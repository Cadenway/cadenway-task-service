/**
 * Type PurgeTrashBatchOutput
 *
 * @description
 * What one batch of the purge did: `none-left` when no entry is handed over or due (or every one
 * is locked by another batch); `purged` with the entries it erased whole, the tasks it erased (a
 * part of an entry too large for one batch counts its 500 tasks and no entry), and the deleted
 * lists and spaces it left without a task, which the spaces module erased.
 */
export type PurgeTrashBatchOutput =
  | { readonly outcome: 'none-left' }
  | {
      readonly outcome: 'purged';
      readonly entries: number;
      readonly tasks: number;
      readonly listsPurged: number;
      readonly spacesPurged: number;
    };
