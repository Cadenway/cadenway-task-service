import type { FavoriteKind } from './favorite-kind.value-object.js';

/** Keys target display data by both kind and ID. */
export function favoriteTargetKey(target: {
  readonly kind: FavoriteKind;
  readonly targetId: string;
}): string {
  return `${target.kind}:${target.targetId}`;
}
