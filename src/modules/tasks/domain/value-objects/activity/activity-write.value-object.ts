import type { ActivityEntryDraft } from './activity-entry-draft.value-object.js';
import type { ActivityEntryState } from './activity-entry-state.value-object.js';

/**
 * Type ActivityWrite
 *
 * @description
 * What the application writes for one recorded change, as `activity-coalescing.policy.ts` decides
 * it (`openapi/public/tasks.yaml:46-48`):
 *
 * - `insert`: a new entry, the draft;
 * - `update`: the merged entry, under the id of the entry it merges into, with its `from`, the
 *   new `to` and the new `occurredAt`;
 * - `delete`: the entry the change merged into and brought back to its original value, which
 *   disappears.
 *
 * @type {{ readonly action: 'insert'; readonly entry: ActivityEntryDraft } | { readonly action: 'update'; readonly entry: ActivityEntryState } | { readonly action: 'delete'; readonly entry: ActivityEntryState }}
 */
export type ActivityWrite =
  | { readonly action: 'insert'; readonly entry: ActivityEntryDraft }
  | { readonly action: 'update'; readonly entry: ActivityEntryState }
  | { readonly action: 'delete'; readonly entry: ActivityEntryState };
