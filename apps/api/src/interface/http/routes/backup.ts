import type { BackupDocument } from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { BackupRestore } from '../../../application/backup/uc-1-6-backup-restore.js';
import { BackupVersionNotSupported } from '../../../application/backup/uc-1-6-backup-restore.js';
import { DomainError } from '../../../domain/shared/domain-error.js';

interface Dependencies {
  backupRestore: BackupRestore;
}

/** UC-1.6 — the only way data leaves or re-enters the app. */
export function registerBackupRoutes(
  app: FastifyInstance,
  { backupRestore }: Dependencies,
): void {
  app.get('/backup', async (): Promise<BackupDocument> => {
    return backupRestore.export();
  });

  app.post('/restore', async (request, reply) => {
    const document = request.body;

    if (!looksLikeBackup(document)) {
      return badRequest(
        reply,
        'O corpo da requisição não é um backup: não tem version.',
      );
    }

    try {
      await backupRestore.restore(document);
      return await reply.status(204).send();
    } catch (error) {
      if (error instanceof BackupVersionNotSupported) {
        return badRequest(reply, error.message);
      }
      // A malformed document reaches the aggregates as invalid input, and
      // their own errors say more than "restore failed" would.
      if (error instanceof DomainError) {
        return badRequest(
          reply,
          `Não foi possível ler o backup: ${error.message}`,
        );
      }
      throw error;
    }
  });
}

function looksLikeBackup(body: unknown): body is BackupDocument {
  return typeof body === 'object' && body !== null && 'version' in body;
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}
