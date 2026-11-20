/** The result of one batch of watcher override cleanup. */
export type RemoveMemberWatcherOverridesOutput =
  | { readonly outcome: 'none-left' }
  | { readonly outcome: 'member-again' }
  | { readonly outcome: 'removed'; readonly removed: number; readonly lastTaskId: string };
