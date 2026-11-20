/**
 * Type DeletionStep
 *
 * @description
 * A step of the deletion jobs, as a failed step names it:
 *
 * - `lists`: the reading of the deleted lists of a deleted space, with the dropping of the pending
 *   requests of the space when it is still deleted;
 * - `tasks`: a batch that moves tasks of a deleted list to the trash and drops the pending requests
 *   of the list (in its first batch) and of the tasks it moved;
 * - `space`: the erasure of a deleted space left without a list;
 * - `requests`: the dropping of the pending requests of the tasks of a trash entry that are still
 *   in the trash or erased;
 * - `purge`: a batch of the erasure of the trash of an organization;
 * - `schedule`: a page of the daily schedule of the purge (the read of the organizations, or the
 *   enqueuing of their jobs).
 *
 * @type {'lists' | 'tasks' | 'space' | 'requests' | 'purge' | 'schedule'}
 */
export type DeletionStep = 'lists' | 'tasks' | 'space' | 'requests' | 'purge' | 'schedule';
