/**
 * Type LookIcon
 *
 * @description
 * Icon of a space or a list ("Icône"), as `LookIcon` of `openapi/internal/task-service.yaml` names
 * it: `rocket` ("Fusée"), `paint` ("Pinceau"), `megaphone` ("Mégaphone"), `gear` ("Engrenage"),
 * `code` ("Code"), `bug` ("Bogue"), `lightning` ("Éclair"), `target` ("Cible"), `flag`
 * ("Drapeau"), `briefcase` ("Mallette"), `chart` ("Courbe"), `users` ("Équipe"), `book`
 * ("Livre"), `cube` ("Cube"), `headset` ("Casque"), `globe` ("Globe") or `star` ("Étoile"), the
 * keys of `LOOK_ICONS` of the mockup. A resource without an icon carries `null` instead.
 *
 * @type {'rocket' | 'paint' | 'megaphone' | 'gear' | 'code' | 'bug' | 'lightning' | 'target' | 'flag' | 'briefcase' | 'chart' | 'users' | 'book' | 'cube' | 'headset' | 'globe' | 'star'}
 */
export type LookIcon =
  | 'rocket'
  | 'paint'
  | 'megaphone'
  | 'gear'
  | 'code'
  | 'bug'
  | 'lightning'
  | 'target'
  | 'flag'
  | 'briefcase'
  | 'chart'
  | 'users'
  | 'book'
  | 'cube'
  | 'headset'
  | 'globe'
  | 'star';

/**
 * Constant LOOK_ICONS
 *
 * @description
 * The icons a space or a list may take, in the order of `LookIcon` of
 * `openapi/internal/task-service.yaml`.
 *
 * @type {readonly LookIcon[]}
 */
export const LOOK_ICONS: readonly LookIcon[] = Object.freeze([
  'rocket',
  'paint',
  'megaphone',
  'gear',
  'code',
  'bug',
  'lightning',
  'target',
  'flag',
  'briefcase',
  'chart',
  'users',
  'book',
  'cube',
  'headset',
  'globe',
  'star',
]);
