/**
 * Type ReadLock
 *
 * @description
 * How a read of another module locks what it reads, until the end of the transaction: `none`, or
 * `share-unless-locked` (`FOR SHARE SKIP LOCKED`), which a request for access takes on its target
 * so that a deletion or a trash of it either committed first or waits for the request, while a
 * target a writer holds at that instant reads as unknown at once instead of being waited for. The
 * statements are the same for every outcome, the lock included, and none waits on the target, so
 * neither they nor the time of the answer tell whether the target exists.
 *
 * @type {'none' | 'share-unless-locked'}
 */
export type ReadLock = 'none' | 'share-unless-locked';
