import type { AccessTarget } from '../../../../projections/access/access-target.projection.js';

/**
 * Type FindAccessTargetOutput
 *
 * @description
 * The target with the access of the member, or `null` when the organization has no such space or
 * list.
 *
 * @type {AccessTarget | null}
 */
export type FindAccessTargetOutput = AccessTarget | null;
