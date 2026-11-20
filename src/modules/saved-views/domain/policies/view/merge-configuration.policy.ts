import { IncompleteSheetSort } from '../../errors/view/incomplete-sheet-sort.error.js';
import type { SavedViewConfiguration } from '../../value-objects/view/saved-view-configuration.value-object.js';
import type { SavedViewPatch } from '../../value-objects/view/saved-view-patch.value-object.js';

/** Settings that can be changed independently of the name and icon. */
type SavedViewConfigurationPatch = NonNullable<SavedViewPatch['configuration']>;

/** Server filter values. */
type SavedViewFilters = SavedViewConfiguration['filters'];

/** Nullable field replacements for the server filters. */
type SavedViewFiltersPatch = NonNullable<SavedViewConfigurationPatch['filters']>;

/** Persisted settings specific to the client. */
type SavedViewPresentationValue = NonNullable<SavedViewConfiguration['presentation']>;

/** Client settings that can be replaced or removed. */
type SavedViewPresentationPatch = NonNullable<SavedViewConfigurationPatch['presentation']>;

/** The client-side sheet sort, independent of the server sort. */
type SavedViewPresentationValueSheetSort = NonNullable<SavedViewPresentationValue['sheetSort']>;

/** Replaces a nullable setting, preserving the current value for an omitted key. */
function mergeSetting<T>(current: T | undefined, patch: T | null | undefined): T | undefined {
  return patch === null ? undefined : (patch ?? current);
}

/** Applies explicit replacements to filters, removing only keys with a null patch. */
function mergeFilters(current: SavedViewFilters, patch: SavedViewFiltersPatch): SavedViewFilters {
  const result: SavedViewFilters = {};
  const status = mergeSetting(current.status, patch.status);
  const priority = mergeSetting(current.priority, patch.priority);
  const assignee = mergeSetting(current.assignee, patch.assignee);
  const label = mergeSetting(current.label, patch.label);
  if (status !== undefined) result.status = status;
  if (priority !== undefined) result.priority = priority;
  if (assignee !== undefined) result.assignee = assignee;
  if (label !== undefined) result.label = label;
  return result;
}

/** Merges a sheet sort, where a patch may change only one of its two members. */
function mergeSheetSort(
  current: SavedViewPresentationValueSheetSort | undefined,
  patch: SavedViewPresentationPatch['sheetSort'],
): SavedViewPresentationValueSheetSort | undefined {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  const column = patch.column ?? current?.column;
  const direction = patch.direction ?? current?.direction;
  if (column === undefined || direction === undefined) {
    throw new IncompleteSheetSort('A sheet sort requires both column and direction.');
  }
  return { column, direction };
}

/** Merges the client-only settings independently of the server query. */
function mergePresentation(
  current: SavedViewPresentationValue | undefined,
  patch: SavedViewPresentationPatch | null | undefined,
): SavedViewPresentationValue | undefined {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  const result: SavedViewPresentationValue = {};
  const hiddenBoardStatusKeys = mergeSetting(
    current?.hiddenBoardStatusKeys,
    patch.hiddenBoardStatusKeys,
  );
  const hiddenSheetColumns = mergeSetting(current?.hiddenSheetColumns, patch.hiddenSheetColumns);
  const sheetSort = mergeSheetSort(current?.sheetSort, patch.sheetSort);
  if (hiddenBoardStatusKeys !== undefined) result.hiddenBoardStatusKeys = hiddenBoardStatusKeys;
  if (hiddenSheetColumns !== undefined) result.hiddenSheetColumns = hiddenSheetColumns;
  if (sheetSort !== undefined) result.sheetSort = sheetSort;
  return result;
}

/** Applies nested JSON Merge Patch, preserving null as the value for ungrouped views. */
export function mergeConfiguration(
  current: SavedViewConfiguration,
  patch: SavedViewConfigurationPatch | undefined,
): SavedViewConfiguration {
  if (patch === undefined) return current;
  const result: SavedViewConfiguration = {
    layout: patch.layout ?? current.layout,
    sort: patch.sort ?? current.sort,
    groupBy: patch.groupBy === undefined ? current.groupBy : patch.groupBy,
    filters:
      patch.filters === undefined ? current.filters : mergeFilters(current.filters, patch.filters),
  };
  const presentation = mergePresentation(current.presentation, patch.presentation);
  if (presentation !== undefined) result.presentation = presentation;
  return result;
}
