/** Checks an attachment UUIDv7 from the P4 intake contract; hexadecimal case is immaterial. */
export function isIntakeAttachmentId(id: string): boolean {
  return (
    id.length === 36 && /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id)
  );
}
