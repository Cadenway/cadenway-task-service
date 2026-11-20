import { mergeConfiguration } from '../../policies/view/merge-configuration.policy.js';
import type { SavedViewConfiguration } from '../../value-objects/view/saved-view-configuration.value-object.js';
import type { SavedViewPatch } from '../../value-objects/view/saved-view-patch.value-object.js';

/** Persisted state and list-relative position of a shared saved view. */
export interface SavedView {
  // #region Properties
  /** Database-generated identity of the view. */
  id: string;

  /** Tenant of the view. */
  organizationId: string;

  /** Parent list identifier. */
  listId: string;

  /** Display name of the view. */
  name: string;

  /** Icon, or null for the default. */
  icon: string | null;

  /** Server query and client presentation settings. */
  configuration: SavedViewConfiguration;

  /** List-relative slot, used only inside the service. */
  position: number;

  /** Creation instant. */
  createdAt: Date;

  /** Most recent settings change. */
  updatedAt: Date;

  /** Optimistic version of the shared view. */
  version: number;
  // #endregion
}

/** Applies an already validated patch, preserving identity and placement. */
export function patchSavedView(view: SavedView, patch: SavedViewPatch): SavedView {
  return {
    ...view,
    name: patch.name ?? view.name,
    icon: patch.icon === undefined ? view.icon : patch.icon,
    configuration: mergeConfiguration(view.configuration, patch.configuration),
  };
}

/** Caps the copied name at the contract ceiling in Unicode code points. */
export function duplicateSavedViewName(name: string): string {
  const suffix = ' (copie)';
  return (
    Array.from(name)
      .slice(0, 80 - suffix.length)
      .join('') + suffix
  );
}

/** Compares the persisted settings without depending on JSON object order returned by JSONB. */
export function sameSettings(current: SavedView, patched: SavedView): boolean {
  return (
    current.name === patched.name &&
    current.icon === patched.icon &&
    settingsFingerprint(current.configuration) === settingsFingerprint(patched.configuration)
  );
}

/** Serializes the settings in semantic key order, retaining the order of every explicit array. */
function settingsFingerprint(configuration: SavedViewConfiguration): string {
  const { layout, sort, groupBy, filters, presentation } = configuration;
  const client =
    presentation === undefined
      ? null
      : [
          presentation.hiddenBoardStatusKeys,
          presentation.hiddenSheetColumns,
          presentation.sheetSort?.column,
          presentation.sheetSort?.direction,
        ];
  return JSON.stringify([
    layout,
    sort,
    groupBy,
    filters.status,
    filters.priority,
    filters.assignee,
    filters.label,
    client,
  ]);
}
