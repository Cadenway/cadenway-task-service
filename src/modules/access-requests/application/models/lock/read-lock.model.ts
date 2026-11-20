/**
 * Type ReadLock
 *
 * @description
 * How a read of another module locks what it reads, until the end of the transaction: `none`, or
 * `share` (`FOR SHARE`), which a request for access takes on its target so that a deletion or a
 * trash of it running meanwhile either commits first or waits for the request. The statements are
 * the same for every outcome, the lock included, so they never tell whether the target exists.
 *
 * @type {'none' | 'share'}
 */
export type ReadLock = 'none' | 'share';
