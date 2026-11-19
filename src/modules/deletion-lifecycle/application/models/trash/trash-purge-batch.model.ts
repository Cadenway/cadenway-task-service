/**
 * Type TrashPurgeBatch
 *
 * @description
 * What one batch of the erasure of the trash of an organization did, as the purge job reads it:
 *
 * - `none-left`: no entry handed over by "Vider la corbeille" and no entry due (deleted 30 days
 *   ago or more) is left, apart from those another job holds;
 * - `purged`: the batch erased `entries` entries holding `tasks` tasks, then `listsPurged` deleted
 *   lists and `spacesPurged` deleted spaces left without a task; the job asks for the next batch.
 *
 * @type {{ readonly outcome: 'none-left' } | { readonly outcome: 'purged'; readonly entries: number; readonly tasks: number; readonly listsPurged: number; readonly spacesPurged: number }}
 */
export type TrashPurgeBatch =
  | { readonly outcome: 'none-left' }
  | {
      readonly outcome: 'purged';
      readonly entries: number;
      readonly tasks: number;
      readonly listsPurged: number;
      readonly spacesPurged: number;
    };
