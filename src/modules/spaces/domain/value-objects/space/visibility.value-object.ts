/**
 * Type Visibility
 *
 * @description
 * Who sees a space ("Confidentialité"), as `Visibility` of `openapi/internal/task-service.yaml`
 * names it: `organization` ("Tout Atelier Nord": every member of the organization but the guests)
 * or `private` ("Privé": its owner only in this version, "Who sees a space" of
 * `openapi/public/spaces.yaml`).
 *
 * @type {'organization' | 'private'}
 */
export type Visibility = 'organization' | 'private';
