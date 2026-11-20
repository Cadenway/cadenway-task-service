import type { FactoryProvider } from '@nestjs/common';

import { ResolveCustomFieldSpace } from '../../../../../spaces/public/space/resolve-custom-field-space.js';
import type { CustomFieldsStore } from '../../../../application/models/custom-field/custom-fields-store.model.js';
import type { MemberDirectory } from '../../../../application/ports/outbound/members/membership/member-directory.port.js';
import type { SpaceDirectory } from '../../../../application/ports/outbound/spaces/space/space-directory.port.js';
import type { CustomFieldsUnitOfWork } from '../../../../application/ports/outbound/transactions/custom-field/custom-fields-unit-of-work.port.js';
import type { TasksUnitOfWork } from '../../../../application/ports/outbound/transactions/task/tasks-unit-of-work.port.js';
import { CustomFieldAccess } from '../../../../application/services/custom-field/custom-field-access.service.js';
import { CreateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/create-space-custom-field/create-space-custom-field.use-case.js';
import { RetireSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/retire-space-custom-field/retire-space-custom-field.use-case.js';
import { UpdateSpaceCustomField } from '../../../../application/use-cases/commands/custom-field/update-space-custom-field/update-space-custom-field.use-case.js';
import { GetSpaceCustomField } from '../../../../application/use-cases/queries/custom-field/get-space-custom-field/get-space-custom-field.use-case.js';
import { ListListCustomFields } from '../../../../application/use-cases/queries/custom-field/list-list-custom-fields/list-list-custom-fields.use-case.js';
import { ListSpaceCustomFields } from '../../../../application/use-cases/queries/custom-field/list-space-custom-fields/list-space-custom-fields.use-case.js';
import { MEMBER_DIRECTORY } from '../../../tokens/membership/member-directory.token.js';
import { SPACE_DIRECTORY } from '../../../tokens/space/space-directory.token.js';
import { TASKS_UNIT_OF_WORK } from '../../../tokens/task/tasks-unit-of-work.token.js';

const CUSTOM_FIELDS_UNIT_OF_WORK = Symbol('CustomFieldsUnitOfWork');

const useCases = [
  CreateSpaceCustomField,
  RetireSpaceCustomField,
  UpdateSpaceCustomField,
  GetSpaceCustomField,
  ListListCustomFields,
  ListSpaceCustomFields,
] as const;

/** Binds custom field definitions to the task transaction and the space-owned role check. */
export const customFieldProviders: readonly FactoryProvider[] = [
  {
    provide: CUSTOM_FIELDS_UNIT_OF_WORK,
    inject: [TASKS_UNIT_OF_WORK],
    useFactory: (tasks: TasksUnitOfWork): CustomFieldsUnitOfWork => ({
      run: <T>(execute: (store: CustomFieldsStore) => Promise<T>): Promise<T> =>
        tasks.run(({ customFields: fields, clock }) => execute({ fields, clock })),
      runReadOnly: <T>(execute: (store: CustomFieldsStore) => Promise<T>): Promise<T> =>
        tasks.runReadOnly(({ customFields: fields, clock }) => execute({ fields, clock }), {
          snapshot: true,
        }),
    }),
  },
  {
    provide: CustomFieldAccess,
    inject: [MEMBER_DIRECTORY, SPACE_DIRECTORY, ResolveCustomFieldSpace],
    useFactory: (
      members: MemberDirectory,
      spaces: SpaceDirectory,
      resolveSpace: ResolveCustomFieldSpace,
    ): CustomFieldAccess =>
      new CustomFieldAccess(
        members,
        {
          resolve: (organizationId, spaceId, viewer, lock) =>
            resolveSpace.execute({
              organizationId,
              spaceId,
              viewerUserId: viewer.userId,
              viewerRole: viewer.role,
              lock,
            }),
        },
        spaces,
      ),
  },
  ...useCases.map((UseCase) => ({
    provide: UseCase,
    inject: [CUSTOM_FIELDS_UNIT_OF_WORK, CustomFieldAccess],
    useFactory: (work: CustomFieldsUnitOfWork, access: CustomFieldAccess) =>
      new UseCase(work, access),
  })),
];
