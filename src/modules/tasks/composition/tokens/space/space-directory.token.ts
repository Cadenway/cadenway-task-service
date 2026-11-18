/**
 * Constant SPACE_DIRECTORY
 *
 * @description
 * Identifies the `SpaceDirectory` of the module, bound to the public operations of the spaces
 * module: the lookup of a list the viewer sees, the spaces the viewer sees and the allocation of
 * task keys.
 *
 * @type {unique symbol}
 */
export const SPACE_DIRECTORY: unique symbol = Symbol('SpaceDirectory');
