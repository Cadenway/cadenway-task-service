import { CreateAccessRequestInternalBody } from '@cadenway/contracts/validators/internal/task-service';
import { zodDto } from '@cadenway/nest-common';

import { refuseTargetCount } from '../../../validation/access-request/access-request-target.validator.js';
import { refuseUnstorableText } from '../../../validation/text/storable-text.validator.js';

/**
 * Class CreateAccessRequestBody
 *
 * @description
 * Body of `POST /internal/v1/access-requests` (`AccessRequestCreation`), validated with the schema
 * of the contract (a UUID `spaceId` or `listId`, a `taskKey` of the key pattern, a message of 500
 * characters at most), then refined: exactly one target, else `400 request.invalid` with one issue
 * on the body, and a message without U+0000. Members the contract does not declare are dropped.
 */
export class CreateAccessRequestBody extends zodDto(
  CreateAccessRequestInternalBody.superRefine((body, context) => {
    refuseTargetCount(context, body);
    refuseUnstorableText(context, body.message, ['message']);
  }),
) {}
