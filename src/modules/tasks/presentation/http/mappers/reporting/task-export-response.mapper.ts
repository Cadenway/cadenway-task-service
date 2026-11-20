import { ExportListTasksInternalResponse } from '@cadenway/contracts/validators/internal/task-service';
import { DEFAULT_REQUEST_BUDGET_MS, remainingBudgetMs } from '@cadenway/nest-common';
import type { Response } from 'express';
import { Buffer } from 'node:buffer';
import { once } from 'node:events';

import type { ExportListTasksSink } from '../../../../application/models/reporting/export-list-tasks-sink.model.js';
import type { ExportListTasksOutput } from '../../../../application/use-cases/queries/reporting/export-list-tasks/export-list-tasks.output.js';

const exportMetadata = ExportListTasksInternalResponse.pick({ filename: true, header: true });
const exportRow = ExportListTasksInternalResponse.shape.rows.element;
const JSON_MEDIA_TYPE = 'application/json';
const NDJSON_MEDIA_TYPE = 'application/x-ndjson';
const MAX_RECORD_BYTES = 131_072;

function optsIntoNdjson(response: Response): boolean {
  const explicitOffer = response.req.headers.accept
    ?.split(',')
    .some((range) => range.split(';')[0]?.trim().toLowerCase() === NDJSON_MEDIA_TYPE);
  return (
    explicitOffer === true &&
    response.req.accepts([JSON_MEDIA_TYPE, NDJSON_MEDIA_TYPE]) === NDJSON_MEDIA_TYPE
  );
}

function ndjsonLine(frame: object): string {
  const line = `${JSON.stringify(frame)}\n`;
  if (Buffer.byteLength(line, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error('The export record exceeds its byte limit.');
  }
  return line;
}

/** Streams contracted JSON or explicitly requested NDJSON. Completes only after the commit. */
export async function writeTaskExport(
  response: Response,
  read: (sink: ExportListTasksSink, signal: AbortSignal) => Promise<ExportListTasksOutput>,
): Promise<void> {
  const closed = new AbortController();
  const onClose = (): void => {
    closed.abort();
  };
  const budget = Math.ceil(remainingBudgetMs() ?? DEFAULT_REQUEST_BUDGET_MS);
  const deadline = budget > 0 ? AbortSignal.timeout(budget) : AbortSignal.abort();
  const signal = AbortSignal.any([closed.signal, deadline]);
  response.once('close', onClose);
  if (response.destroyed) onClose();
  const sendRows = response.req.method !== 'HEAD';
  const ndjson = optsIntoNdjson(response);
  let firstRow = true;

  async function write(chunk: string): Promise<void> {
    signal.throwIfAborted();
    if (!response.write(chunk)) await once(response, 'drain', { signal });
  }

  try {
    signal.throwIfAborted();
    const result = await read(
      {
        async start(metadata) {
          const { filename, header } = exportMetadata.parse(metadata);
          const mediaType = ndjson ? NDJSON_MEDIA_TYPE : JSON_MEDIA_TYPE;
          response.status(200).vary('Accept').type(`${mediaType}; charset=utf-8`);
          if (sendRows) {
            await write(
              ndjson
                ? ndjsonLine({ kind: 'metadata', filename, header })
                : `{"filename":${JSON.stringify(filename)},"header":${JSON.stringify(header)},"rows":[`,
            );
          }
          return sendRows;
        },
        async row(row) {
          const projection = exportRow.parse(row);
          await write(
            ndjson
              ? ndjsonLine({ kind: 'row', row: projection })
              : `${firstRow ? '' : ','}${JSON.stringify(projection)}`,
          );
          firstRow = false;
        },
      },
      signal,
    );
    signal.throwIfAborted();
    if (sendRows && ndjson)
      await write(ndjsonLine({ kind: 'complete', rowCount: result.rowCount }));
    response.end(sendRows && !ndjson ? ']}' : undefined);
  } catch (error) {
    if (closed.signal.aborted && response.destroyed) return;
    if (response.headersSent) response.destroy();
    throw error;
  } finally {
    response.off('close', onClose);
  }
}
