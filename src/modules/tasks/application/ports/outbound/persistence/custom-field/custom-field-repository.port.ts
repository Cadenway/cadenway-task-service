import type { CustomFieldDefinition } from '../../../../../domain/value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldValueChange } from '../../../../../domain/value-objects/custom-field/custom-field-value-change.value-object.js';

/** Tenant-scoped definitions and sparse task values, bound to the caller's transaction. */
export interface CustomFieldRepository {
  // #region Methods
  /** Runs the requested field operation. */
  allocateId(): Promise<string>;
  activeDefinitions(
    organizationId: string,
    spaceId: string,
  ): Promise<readonly CustomFieldDefinition[]>;
  create(organizationId: string, definition: CustomFieldDefinition): Promise<void>;
  saveDefinitions(
    organizationId: string,
    spaceId: string,
    definitions: readonly CustomFieldDefinition[],
  ): Promise<void>;
  retire(
    organizationId: string,
    spaceId: string,
    retired: CustomFieldDefinition,
    updated: readonly CustomFieldDefinition[],
    retiredAt: Date,
  ): Promise<void>;
  hasNegativeValues(organizationId: string, fieldId: string): Promise<boolean>;
  valuesForTasks(
    organizationId: string,
    spaceId: string,
    taskIds: readonly string[],
  ): Promise<
    readonly {
      readonly taskId: string;
      readonly fieldId: string;
      readonly value: number | string;
    }[]
  >;
  valuesForTaskPage(
    organizationId: string,
    tasks: readonly {
      readonly taskId: string;
      readonly spaceId: string;
      readonly listId: string;
    }[],
  ): Promise<
    readonly {
      readonly taskId: string;
      readonly fieldId: string;
      readonly value: number | string;
    }[]
  >;
  applyValues(
    organizationId: string,
    taskId: string,
    changes: readonly CustomFieldValueChange[],
  ): Promise<void>;
  clearTasks(organizationId: string, taskIds: readonly string[]): Promise<void>;
  // #endregion
}
