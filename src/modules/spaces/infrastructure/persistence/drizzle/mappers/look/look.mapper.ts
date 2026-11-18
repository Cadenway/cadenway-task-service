import type { LookColor } from '../../../../../domain/value-objects/look/look-color.value-object.js';
import { LOOK_COLORS } from '../../../../../domain/value-objects/look/look-color.value-object.js';
import type { LookIcon } from '../../../../../domain/value-objects/look/look-icon.value-object.js';
import { LOOK_ICONS } from '../../../../../domain/value-objects/look/look-icon.value-object.js';

/**
 * Function toLookColor
 *
 * @description
 * Narrows a stored color to the palette. The column is plain `text` (the domain validates the
 * palette), so a value outside it means the row was written by something else than this service.
 *
 * @param {string} value - The stored color.
 * @returns {LookColor} The color.
 * @throws {Error} When the value is not a color of the palette.
 */
export function toLookColor(value: string): LookColor {
  const color: LookColor | undefined = LOOK_COLORS.find(
    (candidate: LookColor): boolean => candidate === value,
  );
  if (color === undefined) {
    throw new Error('A stored color is outside the palette.');
  }
  return color;
}

/**
 * Function toLookIcon
 *
 * @description
 * Narrows a stored icon to the icon set; `null` stays `null` (no icon).
 *
 * @param {string | null} value - The stored icon.
 * @returns {LookIcon | null} The icon, or `null`.
 * @throws {Error} When the value is not an icon of the set.
 */
export function toLookIcon(value: string | null): LookIcon | null {
  if (value === null) {
    return null;
  }
  const icon: LookIcon | undefined = LOOK_ICONS.find(
    (candidate: LookIcon): boolean => candidate === value,
  );
  if (icon === undefined) {
    throw new Error('A stored icon is outside the icon set.');
  }
  return icon;
}
