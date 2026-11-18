/**
 * Interface StatusPatch
 *
 * @description
 * Change of one status of a space (`SpaceStatusPatch` of `openapi/internal/task-service.yaml`), a
 * JSON Merge Patch: a member left out is unchanged.
 */
export interface StatusPatch {
  // #region Properties
  /**
   * Property name
   *
   * @description
   * New name, trimmed, 1 to 24 characters once trimmed; `null` puts back the default label.
   *
   * @type {string | null | undefined}
   * @readonly
   */
  readonly name?: string | null;

  /**
   * Property hidden
   *
   * @description
   * `true` to stop using the status, `false` to use it again; `todo` and `done` cannot be hidden.
   *
   * @type {boolean | undefined}
   * @readonly
   */
  readonly hidden?: boolean;
  // #endregion
}
