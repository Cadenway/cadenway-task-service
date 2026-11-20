import type { SavedViewConfiguration } from '../../../domain/value-objects/view/saved-view-configuration.value-object.js';

/** Explicit settings for a new shared view. */
export interface SavedViewCreation {
  // #region Properties
  /** Name selected by the editor. */
  readonly name: string;

  /** Icon selected by the editor, or null. */
  readonly icon?: string | null;

  /** Explicit server and client settings to persist. */
  readonly configuration: SavedViewConfiguration;
  // #endregion
}
