import type { FavoriteOwner } from '../../../../models/collection/favorite-owner.model.js';
import type { FavoriteTarget } from '../../../../models/target/favorite-target.model.js';

/** Target to add and the owner derived from the verified context. */
export interface CreateFavoriteInput extends FavoriteOwner, FavoriteTarget {}
