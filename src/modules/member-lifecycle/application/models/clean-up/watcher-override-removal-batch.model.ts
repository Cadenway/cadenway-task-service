/** The result of one bounded deletion of a former member's task watcher overrides. */
export type WatcherOverrideRemovalBatch =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'removed'; readonly removed: number; readonly lastTaskId: string };
