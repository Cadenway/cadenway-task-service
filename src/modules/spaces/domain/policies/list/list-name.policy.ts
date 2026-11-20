export const MAX_LIST_NAME_LENGTH = 80;

const COPY_SUFFIX = ' (copie)';

/** The name of a copy, clipped by Unicode code points to the normal list name bound. */
export function copiedListName(source: string): string {
  return (
    Array.from(source)
      .slice(0, MAX_LIST_NAME_LENGTH - COPY_SUFFIX.length)
      .join('') + COPY_SUFFIX
  );
}
