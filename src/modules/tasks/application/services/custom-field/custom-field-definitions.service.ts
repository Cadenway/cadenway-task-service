import { SpaceCustomFields } from '../../../domain/aggregates/custom-field/space-custom-fields.aggregate.js';
import { CustomFieldError } from '../../../domain/errors/custom-field/custom-field.error.js';
import type { CustomFieldDefinition } from '../../../domain/value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldDefinitionPatch } from '../../../domain/value-objects/custom-field/custom-field-definition-patch.value-object.js';
import type { CustomFieldPosition } from '../../models/custom-field/custom-field-position.model.js';
import type { CustomFieldPage } from '../../models/custom-field/custom-field-page.model.js';
import { CustomFieldRefusal } from '../../models/custom-field/custom-field-refusal.model.js';
import type { CustomFieldsStore } from '../../models/custom-field/custom-fields-store.model.js';
import type { ReadonlyCustomFieldsStore } from '../../models/custom-field/readonly-custom-fields-store.model.js';
import { PageSlicer } from '../page/page-slicer.service.js';

/** Applies the aggregate to a complete, bounded space snapshot. */
export class CustomFieldDefinitions {
  // #region Methods
  /** Runs the requested field operation. */
  public async page(
    store: ReadonlyCustomFieldsStore,
    organizationId: string,
    spaceId: string,
    after: CustomFieldPosition | null,
    limit: number,
  ): Promise<CustomFieldPage> {
    const all = await store.fields.activeDefinitions(organizationId, spaceId);
    const remaining = all.filter(
      (field) =>
        after === null ||
        field.position > after.position ||
        (field.position === after.position && field.id > after.id),
    );
    return new PageSlicer().slice(remaining.slice(0, limit + 1), limit, (field) => ({
      position: field.position,
      id: field.id,
    }));
  }

  public async get(
    store: ReadonlyCustomFieldsStore,
    organizationId: string,
    spaceId: string,
    fieldId: string,
  ): Promise<CustomFieldDefinition> {
    const fields = await store.fields.activeDefinitions(organizationId, spaceId);
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) throw new CustomFieldRefusal('not-found');
    return field;
  }

  public async create(
    store: CustomFieldsStore,
    organizationId: string,
    spaceId: string,
    input: Pick<CustomFieldDefinition, 'name' | 'type'>,
  ): Promise<CustomFieldDefinition> {
    return this.mapDomainErrors(async () => {
      const fields = await store.fields.activeDefinitions(organizationId, spaceId);
      const id = await store.fields.allocateId();
      const definition = new SpaceCustomFields(spaceId, fields).append(id, input);
      await store.fields.create(organizationId, definition);
      return definition;
    });
  }

  public async update(
    store: CustomFieldsStore,
    organizationId: string,
    spaceId: string,
    fieldId: string,
    expectedVersions: readonly number[] | null,
    patch: CustomFieldDefinitionPatch,
  ): Promise<CustomFieldDefinition> {
    return this.mapDomainErrors(async () => {
      const fields = await store.fields.activeDefinitions(organizationId, spaceId);
      this.requireVersion(fields, fieldId, expectedVersions);
      const negative =
        patch.sprintPoints === true &&
        (await store.fields.hasNegativeValues(organizationId, fieldId));
      const result = new SpaceCustomFields(spaceId, fields).update(fieldId, patch, negative);
      if (result.updated.length > 0)
        await store.fields.saveDefinitions(organizationId, spaceId, result.updated);
      return result.definition;
    });
  }

  public async retire(
    store: CustomFieldsStore,
    organizationId: string,
    spaceId: string,
    fieldId: string,
    expectedVersions: readonly number[] | null,
  ): Promise<void> {
    await this.mapDomainErrors(async () => {
      const fields = await store.fields.activeDefinitions(organizationId, spaceId);
      this.requireVersion(fields, fieldId, expectedVersions);
      const result = new SpaceCustomFields(spaceId, fields).retire(fieldId);
      await store.fields.retire(
        organizationId,
        spaceId,
        result.retired,
        result.updated,
        await store.clock.now(),
      );
    });
  }

  private requireVersion(
    fields: readonly CustomFieldDefinition[],
    fieldId: string,
    expected: readonly number[] | null,
  ): void {
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (field === undefined) throw new CustomFieldRefusal('not-found');
    if (expected !== null && !expected.includes(field.version))
      throw new CustomFieldRefusal('version-mismatch', field.version);
  }

  private async mapDomainErrors<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error: unknown) {
      if (error instanceof CustomFieldError) throw new CustomFieldRefusal(error.reason);
      throw error;
    }
  }
  // #endregion
}
