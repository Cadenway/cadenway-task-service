import type { StatusKey } from './status-key.value-object.js';

/**
 * Type SpaceStatusUse
 *
 * @description
 * Which statuses a space still uses, by key (`hidden` of `SpaceStatus`, "Statuses" of
 * `openapi/public/spaces.yaml:48-53`): the statuses of the space a task is in after a change,
 * which `status-availability.policy.ts` checks a new status against. The `statuses` of the
 * spaces projections fit this type as they are.
 *
 * @type {Readonly<Record<StatusKey, { readonly hidden: boolean }>>}
 */
export type SpaceStatusUse = Readonly<Record<StatusKey, { readonly hidden: boolean }>>;
