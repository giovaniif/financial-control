import type {
  ApplyImportRequest,
  ImportReportResponse,
  SpreadsheetReading,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  DueDayOutsideCycle,
  ImportAnswersIncomplete,
} from '../../../application/import/compose-backup.js';
import { UnrecognisedSpreadsheet } from '../../../application/import/interpret-spreadsheet.js';
import type { ImportSpreadsheet } from '../../../application/import/uc-1-7-import-spreadsheet.js';
import { UnreadableSpreadsheet } from '../../../domain/ports/spreadsheet-reader.js';

interface Dependencies {
  importSpreadsheet: ImportSpreadsheet;
}

/**
 * Set explicitly rather than left to the plugin's default: the sheet this
 * replaces is well under a megabyte, and an upload limit nobody chose is a
 * limit nobody can reason about.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** UC-1.7 — read a spreadsheet, then apply it with the user's answers. */
export function registerImportRoutes(
  app: FastifyInstance,
  { importSpreadsheet }: Dependencies,
): void {
  /**
   * Reads and returns; nothing is persisted. The reading round-trips through
   * the client and comes back on apply, so a user who backs out here leaves
   * the database untouched.
   */
  app.post('/import/spreadsheet', async (request, reply) => {
    const upload = await request.file({
      limits: { fileSize: MAX_UPLOAD_BYTES },
    });

    if (upload === undefined) {
      return badRequest(reply, 'Attach a spreadsheet file.');
    }

    const bytes = await upload.toBuffer().catch(() => undefined);
    if (bytes === undefined || upload.file.truncated) {
      return badRequest(
        reply,
        `That file is larger than the ${String(MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
      );
    }

    const year = Number(
      (request.query as Record<string, unknown> | undefined)?.[
        'firstColumnYear'
      ],
    );

    try {
      return importSpreadsheet.read(
        new Uint8Array(bytes),
        Number.isSafeInteger(year) ? year : undefined,
      ) satisfies SpreadsheetReading;
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.post('/import/spreadsheet/apply', async (request, reply) => {
    const body = request.body as Partial<ApplyImportRequest> | undefined;
    if (body?.reading === undefined || body.answers === undefined) {
      return badRequest(reply, 'A reading and the answers are both required.');
    }

    try {
      const report = await importSpreadsheet.apply(body.reading, body.answers);

      return report satisfies ImportReportResponse;
    } catch (error) {
      return handle(error, reply);
    }
  });
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

/**
 * A wrong file and an incomplete answer are both user mistakes, so they come
 * back as messages rather than as a stack trace.
 */
function handle(error: unknown, reply: FastifyReply) {
  if (
    error instanceof UnreadableSpreadsheet ||
    error instanceof UnrecognisedSpreadsheet ||
    error instanceof ImportAnswersIncomplete ||
    error instanceof DueDayOutsideCycle
  ) {
    return badRequest(reply, error.message);
  }
  throw error;
}
