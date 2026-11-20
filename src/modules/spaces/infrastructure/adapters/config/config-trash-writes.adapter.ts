import type { TrashWrites } from '../../../application/ports/outbound/feature/trash/trash-writes.port.js';

/**
 * Class ConfigTrashWrites
 *
 * @description
 * `TrashWrites` on the value of `TRASH_WRITES_ENABLED` read once at start-up from the validated
 * configuration (`TrashConfig` of `src/config/app-config.ts`): turning it on or off is a restart.
 */
export class ConfigTrashWrites implements TrashWrites {
  // #region Properties
  /**
   * Property enabled
   *
   * @description
   * Whether the deletions are served.
   *
   * @type {boolean}
   * @readonly
   */
  private readonly enabled: boolean;
  // #endregion

  // #region Constructor
  /**
   * Constructor
   *
   * @description
   * Keeps the value of the switch.
   *
   * @param {boolean} enabled - `TRASH_WRITES_ENABLED` of the configuration.
   * @constructor
   */
  public constructor(enabled: boolean) {
    this.enabled = enabled;
  }
  // #endregion

  // #region Methods
  /**
   * Method isEnabled
   *
   * @description
   * Answers the value of the switch.
   *
   * @returns {boolean} Whether the deletions are served.
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
  // #endregion
}
