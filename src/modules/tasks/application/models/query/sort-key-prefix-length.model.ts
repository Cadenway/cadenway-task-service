/**
 * Constant SORT_KEY_PREFIX_LENGTH
 *
 * @description
 * The length, in code points, of the folded text a sort key keeps (and so the cursor that carries
 * it), as the application and the presentation layers name it. The constant lives in the domain
 * (`sort-key-prefix-length.value-object.ts`), because the infrastructure layer, which cuts the keys
 * in SQL, may import the domain but not the application; the presentation layer, which validates
 * the cursors, may import the application but not the domain. This is the only re-export of it.
 */
export { SORT_KEY_PREFIX_LENGTH } from '../../../domain/value-objects/task/sort-key-prefix-length.value-object.js';
