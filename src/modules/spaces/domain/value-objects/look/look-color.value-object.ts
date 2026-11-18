/**
 * Type LookColor
 *
 * @description
 * Color of a space or a list ("Couleur"), as `LookColor` of `openapi/internal/task-service.yaml`
 * names it: `gris` ("Gris", the default), `violet` ("Améthyste"), `indigo` ("Indigo"), `azur`
 * ("Azur"), `lagon` ("Lagon"), `vert` ("Jade"), `olive` ("Olive"), `jaune` ("Balise"), `orange`
 * ("Cornaline"), `rouge` ("Grenat"), `rose` ("Rose"), `fuchsia` ("Fuchsia") or `ardoise`
 * ("Ardoise"), the keys of `LOOK_COLORS` of the mockup.
 *
 * @type {'gris' | 'violet' | 'indigo' | 'azur' | 'lagon' | 'vert' | 'olive' | 'jaune' | 'orange' | 'rouge' | 'rose' | 'fuchsia' | 'ardoise'}
 */
export type LookColor =
  | 'gris'
  | 'violet'
  | 'indigo'
  | 'azur'
  | 'lagon'
  | 'vert'
  | 'olive'
  | 'jaune'
  | 'orange'
  | 'rouge'
  | 'rose'
  | 'fuchsia'
  | 'ardoise';

/**
 * Constant LOOK_COLORS
 *
 * @description
 * The colors a space or a list may take, in the order of `LookColor` of
 * `openapi/internal/task-service.yaml`.
 *
 * @type {readonly LookColor[]}
 */
export const LOOK_COLORS: readonly LookColor[] = Object.freeze([
  'gris',
  'violet',
  'indigo',
  'azur',
  'lagon',
  'vert',
  'olive',
  'jaune',
  'orange',
  'rouge',
  'rose',
  'fuchsia',
  'ardoise',
]);
