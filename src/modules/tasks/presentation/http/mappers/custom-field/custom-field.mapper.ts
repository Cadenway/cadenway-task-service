import type { CustomFieldDefinition as Response } from '@cadenway/contracts/types/internal/task-service';
import type { CreateSpaceCustomFieldOutput } from '../../../../application/use-cases/commands/custom-field/create-space-custom-field/create-space-custom-field.output.js';

/** Exposes only the fields of the published definition contract. */
export function toCustomField(field: CreateSpaceCustomFieldOutput): Response {
  return {
    id: field.id,
    spaceId: field.spaceId,
    name: field.name,
    type: field.type,
    position: field.position,
    sprintPoints: field.sprintPoints,
    version: field.version,
  };
}
