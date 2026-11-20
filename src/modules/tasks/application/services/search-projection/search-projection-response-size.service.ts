/** Maximum size of the compact JSON response sent to Search, in UTF-8 bytes. */
export const SEARCH_PROJECTION_RESPONSE_LIMIT = 1_048_576;

/** Measures the compact JSON representation used on the wire. */
export function searchProjectionResponseBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}
