import type { SavedViewConfiguration } from './saved-view-configuration.value-object.js';

/** Explicit replacements for each key, with null removing its value. */
type NullableMembers<T> = { [Key in keyof T]?: T[Key] | null };

/** Transport-independent edit that has already passed syntax and vocabulary validation. */
export interface SavedViewPatch {
  // #region Properties
  /** Renames the view when supplied. */
  name?: string;

  /** Replaces or clears the current icon. */
  icon?: string | null;

  /** Merges the settings, leaving unspecified keys intact. */
  configuration?: Partial<Pick<SavedViewConfiguration, 'layout' | 'sort' | 'groupBy'>> & {
    filters?: NullableMembers<SavedViewConfiguration['filters']>;
    presentation?: {
      hiddenBoardStatusKeys?: string[] | null;
      hiddenSheetColumns?: string[] | null;
      hiddenCustomFieldIds?: string[] | null;
      sheetSort?: { column?: string; direction?: string } | null;
      customFieldSort?: { fieldId?: string; direction?: 'asc' | 'desc' } | null;
    } | null;
  };
  // #endregion
}
