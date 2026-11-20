import { CustomFieldError } from '../../errors/custom-field/custom-field.error.js';
import type { CustomFieldDefinitionPatch } from '../../value-objects/custom-field/custom-field-definition-patch.value-object.js';
import type { CustomFieldDefinition } from '../../value-objects/custom-field/custom-field-definition.value-object.js';

const maxActiveFields = 30;
const fieldIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface CustomFieldUpdate {
  // #region Properties
  /** The requested definition after applying the patch. */
  readonly definition: CustomFieldDefinition;

  /** Every changed definition in its new order. */
  readonly updated: readonly CustomFieldDefinition[];
  // #endregion
}

interface CustomFieldRetirement {
  // #region Properties
  /** The definition to mark retired, with any designation cleared. */
  readonly retired: CustomFieldDefinition;

  /** Active definitions whose positions shifted. */
  readonly updated: readonly CustomFieldDefinition[];
  // #endregion
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0 || Array.from(name).length > 80) {
    throw new CustomFieldError('definition-invalid');
  }
  return normalized;
}

function isDefinitionType(type: string): type is CustomFieldDefinition['type'] {
  return type === 'number' || type === 'text';
}

function revise(
  current: CustomFieldDefinition,
  name: string,
  position: number,
  sprintPoints: boolean,
): CustomFieldDefinition {
  if (
    name === current.name &&
    position === current.position &&
    sprintPoints === current.sprintPoints
  ) {
    return current;
  }
  return Object.freeze({ ...current, name, position, sprintPoints, version: current.version + 1 });
}

/**
 * Plans changes to one space's active definitions. Custom field routes in the internal OpenAPI
 * contract define the contiguous order, limit of 30 and single numeric sprint-points source.
 * The caller applies all returned rows against the same locked snapshot.
 */
export class SpaceCustomFields {
  // #region Properties
  /** Space owning every definition in the snapshot. */
  private readonly spaceId: string;

  /** Active definitions in increasing position order. */
  private readonly active: readonly CustomFieldDefinition[];
  // #endregion

  // #region Constructor
  /** Rebuilds the active set without accepting gaps, duplicate IDs or cross-space rows. */
  public constructor(spaceId: string, definitions: readonly CustomFieldDefinition[]) {
    const ordered = [...definitions].sort((left, right) => left.position - right.position);
    const ids = new Set(ordered.map((definition) => definition.id));
    if (
      ordered.length > maxActiveFields ||
      ids.size !== ordered.length ||
      ordered.filter((definition) => definition.sprintPoints).length > 1 ||
      ordered.some(
        (definition, index) =>
          definition.spaceId !== spaceId ||
          definition.position !== index ||
          !fieldIdPattern.test(definition.id) ||
          !isDefinitionType(definition.type) ||
          normalizeName(definition.name) !== definition.name ||
          !Number.isSafeInteger(definition.version) ||
          definition.version < 1 ||
          (definition.sprintPoints && definition.type !== 'number'),
      )
    ) {
      throw new CustomFieldError('definition-invalid');
    }
    this.spaceId = spaceId;
    this.active = ordered.map((definition) => Object.freeze({ ...definition }));
  }
  // #endregion

  // #region Methods
  /** Appends a new field without assigning it to any task or changing the designation. */
  public append(
    id: string,
    input: Pick<CustomFieldDefinition, 'name' | 'type'>,
  ): CustomFieldDefinition {
    if (this.active.length === maxActiveFields) {
      throw new CustomFieldError('limit-reached');
    }
    if (
      !fieldIdPattern.test(id) ||
      !isDefinitionType(input.type) ||
      this.active.some((definition) => definition.id === id)
    ) {
      throw new CustomFieldError('definition-invalid');
    }
    return Object.freeze({
      id,
      spaceId: this.spaceId,
      name: normalizeName(input.name),
      type: input.type,
      position: this.active.length,
      sprintPoints: false,
      version: 1,
    });
  }

  /** Returns the target and all changed definitions, with one version increment per row. */
  public update(
    id: string,
    patch: CustomFieldDefinitionPatch,
    hasNegativeValues: boolean,
  ): CustomFieldUpdate {
    const current = this.requireActive(id);
    const position = patch.position ?? current.position;
    if (!Number.isInteger(position) || position < 0 || position >= this.active.length) {
      throw new CustomFieldError('position-invalid');
    }
    if (patch.sprintPoints === true && (current.type !== 'number' || hasNegativeValues)) {
      throw new CustomFieldError('sprint-points-invalid');
    }

    const definition = revise(
      current,
      patch.name === undefined ? current.name : normalizeName(patch.name),
      position,
      patch.sprintPoints ?? current.sprintPoints,
    );
    const order = this.active.filter((field) => field !== current);
    order.splice(position, 0, current);
    const updated: CustomFieldDefinition[] = [];
    for (const [index, field] of order.entries()) {
      const next =
        field === current
          ? definition
          : revise(
              field,
              field.name,
              index,
              patch.sprintPoints === true ? false : field.sprintPoints,
            );
      if (next !== field) {
        updated.push(next);
      }
    }
    return { definition, updated };
  }

  /** Frees the position and designation while leaving the definition available to historical reads. */
  public retire(id: string): CustomFieldRetirement {
    const current = this.requireActive(id);
    const updated = this.active
      .slice(current.position + 1)
      .map((field) => revise(field, field.name, field.position - 1, field.sprintPoints));
    return {
      retired: Object.freeze({ ...current, sprintPoints: false, version: current.version + 1 }),
      updated,
    };
  }

  /** Resolves only an active ID of this space, leaving other scopes indistinguishable. */
  private requireActive(id: string): CustomFieldDefinition {
    const current = this.active.find((definition) => definition.id === id);
    if (current === undefined) {
      throw new CustomFieldError('not-found');
    }
    return current;
  }
  // #endregion
}
