/**
 * Type CleanUpStep
 *
 * @description
 * A step of the clean-up after a removed member, in the order the job runs them: the handover of
 * the private spaces, the removal of favorites and grants, the dropping of access requests, the
 * unassignment from tasks, and the removal of watcher overrides.
 *
 * @type {'spaces' | 'favorites' | 'grants' | 'requests' | 'tasks' | 'watchers'}
 */
export type CleanUpStep = 'spaces' | 'favorites' | 'grants' | 'requests' | 'tasks' | 'watchers';
