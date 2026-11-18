import type { StatusKey } from './status-key.value-object.js';
import type { StatusPatch } from './status-patch.value-object.js';

/**
 * Type StatusesPatch
 *
 * @description
 * Change of the statuses of a space by key (`SpaceStatusesPatch` of
 * `openapi/internal/task-service.yaml`), a JSON Merge Patch: a key left out is unchanged, a key set
 * to `null` puts back its default label and uses it again.
 *
 * @type {Readonly<Partial<Record<StatusKey, StatusPatch | null>>>}
 */
export type StatusesPatch = Readonly<Partial<Record<StatusKey, StatusPatch | null>>>;
