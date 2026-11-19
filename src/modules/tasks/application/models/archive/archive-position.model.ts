/**
 * Interface ArchivePosition
 *
 * @description
 * Where a page of the archives starts: after the row archived at `archivedAt` with the id `id`,
 * in the order `(archived_at desc, id desc)` of both tabs ("the most recently archived first",
 * `GET /v1/archives/lists` and `GET /v1/archives/tasks` of `openapi/public/archives.yaml`). The
 * presentation layer encodes it in the opaque cursor and checks the form of both values when it
 * decodes one.
 */
export interface ArchivePosition {
  // #region Properties
  /** When the last row of the previous page was archived. */
  readonly archivedAt: Date;

  /** Id of the last row of the previous page: a list, or the root of an archive. */
  readonly id: string;
  // #endregion
}
