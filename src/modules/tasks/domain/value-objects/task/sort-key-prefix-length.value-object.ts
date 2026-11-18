/**
 * Constant SORT_KEY_PREFIX_LENGTH
 *
 * @description
 * How many code points of a folded text a sort key (and so the cursor that carries it) keeps: the
 * folded name of the order by name, and the folded key of a label. The kit rejects a cursor over
 * 2048 characters and the fold can expand a text (NFKD, `ß` to `ss`, `U+FDFA` to eighteen letters),
 * so the key is cut; two texts equal on their first 128 folded code points fall back to the next
 * term of the order (the order of the list for a task, the label key for a label). The
 * infrastructure cuts the key, the presentation layer validates it in the cursor and the fakes
 * count code points, all from this one constant.
 *
 * @type {number}
 */
export const SORT_KEY_PREFIX_LENGTH: number = 128;
