import { CreateSpaceInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseBlankName } from '../../../validation/name/blank-name.validator.js';
import { refuseUnstorableValues } from '../../../validation/text/storable-value.validator.js';

/**
 * Class CreateSpaceBody
 *
 * @description
 * Body of `POST /internal/v1/spaces` (`SpaceCreation`), validated with the schema of the contract,
 * which applies its defaults (`icon` null, `color` gris, `visibility` organization), and a check of
 * the name: a name made only of spaces answers `400 request.invalid` with one issue on `name`,
 * never echoing the value. Members the contract does not declare are dropped.
 */
export class CreateSpaceBody extends zodDto(
  CreateSpaceInternalBody.superRefine((body, context) => {
    refuseBlankName(context, ['name'], body.name);
    refuseUnstorableValues(context, body);
  }),
) {}
