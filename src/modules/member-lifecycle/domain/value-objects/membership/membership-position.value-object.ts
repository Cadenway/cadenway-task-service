/** UUID strings are canonical, so byte order matches the PostgreSQL compound index. */
export function membershipKey(row: {
  readonly organizationId: string;
  readonly memberId: string;
}): string {
  return `${row.organizationId}:${row.memberId}`;
}
