/**
 * Function splitCommaSeparated
 *
 * @description
 * Reads a query parameter the contract writes as a comma-separated list (`style: form, explode:
 * false`: `?kind=status,assign`) into the array its generated schema expects. A text is split on
 * the commas, a parameter repeated (`?kind=status&kind=assign`, which the HTTP parser gives as an
 * array of texts) has each of its texts split the same way, and any other value is returned
 * unchanged, so that the schema refuses it. No item is trimmed or dropped: an empty item, as in
 * `?kind=,status`, stays an empty text the schema refuses, naming the parameter and never quoting
 * the value.
 *
 * @param {unknown} value - The parameter as the HTTP parser gave it.
 * @returns {unknown} The array of items, or the value as it came.
 */
export function splitCommaSeparated(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.split(',');
  }
  if (
    Array.isArray(value) &&
    value.every((item: unknown): item is string => typeof item === 'string')
  ) {
    return value.flatMap((item: string): string[] => item.split(','));
  }
  return value;
}
