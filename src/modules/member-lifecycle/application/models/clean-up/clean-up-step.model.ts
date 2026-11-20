/**
 * Type CleanUpStep
 *
 * @description
 * A step of the clean-up after a removed member, in the order the job runs them: the handover of
 * the private spaces, the removal of favorites and grants, the dropping of the access requests,
 * and the unassignment from the tasks.
 *
 * @type {'spaces' | 'favorites' | 'grants' | 'requests' | 'tasks'}
 */
export type CleanUpStep = 'spaces' | 'favorites' | 'grants' | 'requests' | 'tasks';
