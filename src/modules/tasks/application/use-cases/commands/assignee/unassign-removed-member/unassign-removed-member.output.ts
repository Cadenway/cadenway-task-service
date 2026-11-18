/**
 * Type UnassignRemovedMemberOutput
 *
 * @description
 * What one batch of the unassignment of a former member did, with counts only:
 *
 * - `none-left`: no task after `afterTaskId` has the account; the copy of the memberships was not
 *   read;
 * - `member-again`: the copy holds the account as a member again, so nothing changed, and the
 *   caller stops for good, leaving the remaining tasks as they are;
 * - `unassigned`: the batch locked `locked` tasks and removed the account from `unassigned` of
 *   them (a task that had lost the account before the lock is not counted); the next batch starts
 *   after `lastTaskId`.
 */
export type UnassignRemovedMemberOutput =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | {
      readonly outcome: 'unassigned';
      readonly locked: number;
      readonly unassigned: number;
      readonly lastTaskId: string;
    };
