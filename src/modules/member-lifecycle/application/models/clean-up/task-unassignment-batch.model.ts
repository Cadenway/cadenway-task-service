/**
 * Type TaskUnassignmentBatch
 *
 * @description
 * What one batch of the unassignment of a former member from their tasks did, as the clean-up job
 * reads it:
 *
 * - `none-left`: no task after the given one has the account;
 * - `member-again`: the copy of the memberships holds the account as a member again, so nothing
 *   changed and the job stops for good;
 * - `unassigned`: the batch removed the account from `unassigned` tasks; the next batch starts
 *   after `lastTaskId`.
 */
export type TaskUnassignmentBatch =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | {
      readonly outcome: 'unassigned';
      readonly unassigned: number;
      readonly lastTaskId: string;
    };
