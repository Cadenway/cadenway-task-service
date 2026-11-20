import type { TrashWrites } from '../../../application/ports/outbound/feature/trash/trash-writes.port.js';

/**
 * Class ConfigTrashWrites
 *
 * @description
 * `TrashWrites` on `TRASH_WRITES_ENABLED` of the configuration of the service (`AppConfig`, read
 * once at start-up; `false` unless the deployment turns it on), so the switch takes effect with a
 * restart, never in the middle of a request.
 */
export class ConfigTrashWrites implements TrashWrites {
  // #region Properties
  /**
   * Property enabled
   *
   * @description
   * The value of `TRASH_WRITES_ENABLED`.
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
   * Takes the value of the switch.
   *
   * @param {boolean} enabled - `TRASH_WRITES_ENABLED`.
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
   * Tells whether the writes of the trash are served.
   *
   * @returns {boolean} The value of `TRASH_WRITES_ENABLED`.
   */
  public isEnabled(): boolean {
    return this.enabled;
  }
  // #endregion
}
