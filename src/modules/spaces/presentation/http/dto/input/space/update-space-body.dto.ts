import { STATUS_KEYS } from '@cadenway/contracts';
import { UpdateSpaceInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';
import type { z } from 'zod';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Function checkSpacePatch
 *
 * @description
 * The checks of `SpacePatch` the generated schema cannot express: the name of the space and the
 * name given to each status hold a character other than a space once trimmed. Each failure is one
 * issue on its member.
 *
 * @param {z.infer<typeof UpdateSpaceInternalBody>} body - The parsed patch.
 * @param {z.RefinementCtx} context - Where the issues are added.
 */
function checkSpacePatch(
  body: z.infer<typeof UpdateSpaceInternalBody>,
  context: z.RefinementCtx,
): void {
  refuseBlankName(context, ['name'], body.name);
  refuseUnstorableValues(context, body);
  if (body.statuses === undefined || body.statuses === null) {
    return;
  }
  for (const key of STATUS_KEYS) {
    refuseBlankName(context, ['statuses', key, 'name'], body.statuses[key]?.name);
  }
}

/**
 * Class UpdateSpaceBody
 *
 * @description
 * Body of `PATCH /internal/v1/spaces/{spaceId}`, a JSON Merge Patch (`SpacePatch`), validated with
 * the schema of the contract and `checkSpacePatch`: `400 request.invalid` with one issue per
 * refused member, never echoing a value. A member left out stays absent, which is not `null`:
 * `null` clears `description` and `icon`, puts back the default label of a status and, for
 * `statuses`, every default. Members the contract does not declare are dropped.
 */
export class UpdateSpaceBody extends zodDto(UpdateSpaceInternalBody.superRefine(checkSpacePatch)) {}
