/**
 * Type CleanUpStep
 *
 * @description
 * A step of the clean-up after a removed member, in the order the job runs them: the handover of
 * the private spaces, the removal of the grants, the dropping of the access requests, the
 * unassignment from the tasks.
 *
 * @type {'spaces' | 'grants' | 'requests' | 'tasks'}
 */
export type CleanUpStep = 'spaces' | 'grants' | 'requests' | 'tasks';
