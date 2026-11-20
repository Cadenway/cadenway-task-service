import { CustomFieldError } from '../../errors/custom-field/custom-field.error.js';
import type { CustomFieldDefinition } from '../../value-objects/custom-field/custom-field-definition.value-object.js';
import type { CustomFieldValueChange } from '../../value-objects/custom-field/custom-field-value-change.value-object.js';

function accepts(definition: CustomFieldDefinition, value: number | string | null): boolean {
  if (value === null) {
    return true;
  }
  if (definition.type === 'text') {
    return typeof value === 'string' && Array.from(value).length <= 500;
  }
  return (
    typeof value === 'number' && Number.isFinite(value) && (!definition.sprintPoints || value >= 0)
  );
}

/**
 * Plans a sparse merge patch against the active definitions of the task's resulting space, as
 * specified by `TaskCustomFieldValuesPatch`. A clear still requires an active ID of that space.
 * Existing equal values and absent values already cleared generate no writes.
 */
export function planCustomFieldValueChanges(
  resultingSpaceId: string,
  activeDefinitions: readonly CustomFieldDefinition[],
  currentValues: Readonly<Record<string, number | string>>,
  patch: Readonly<Record<string, number | string | null>>,
): readonly CustomFieldValueChange[] {
  const entries = Object.entries(patch);
  if (entries.length > 30) {
    throw new CustomFieldError('value-invalid');
  }

  const definitions = new Map(activeDefinitions.map((definition) => [definition.id, definition]));
  const changed: CustomFieldValueChange[] = [];
  for (const [fieldId, value] of entries) {
    const definition = definitions.get(fieldId);
    if (definition?.spaceId !== resultingSpaceId || !accepts(definition, value)) {
      throw new CustomFieldError('value-invalid');
    }
    if ((currentValues[fieldId] ?? null) !== value) {
      changed.push({ fieldId, value });
    }
  }
  return changed;
}
