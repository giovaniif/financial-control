import type {
  AccountResponse,
  AccountsResponse,
  AccountType,
  CorrectBalanceRequest,
  OpenAccountRequest,
  RenameAccountRequest,
} from '@fin/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type {
  AccountView,
  ManageAccounts,
} from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import { AccountNotFound } from '../../../application/budgeting/uc-1-2-manage-accounts.js';
import { InvalidAccount } from '../../../domain/budgeting/account.js';
import { InvalidAmount } from '../../../domain/shared/money.js';

interface Dependencies {
  manageAccounts: ManageAccounts;
}

const TYPES = new Set<string>(['CHECKING', 'SAVINGS', 'CASH']);

function asRecord(body: unknown): Record<string, unknown> | undefined {
  return typeof body === 'object' && body !== null
    ? (body as Record<string, unknown>)
    : undefined;
}

function readOpenRequest(body: unknown): OpenAccountRequest | undefined {
  const record = asRecord(body);
  const name = record?.['name'];
  const type = record?.['type'];
  const balance = record?.['balance'];

  if (
    typeof name !== 'string' ||
    typeof type !== 'string' ||
    !TYPES.has(type) ||
    typeof balance !== 'number'
  ) {
    return undefined;
  }
  return { name, type: type as AccountType, balance };
}

function toResponse(view: AccountView): AccountResponse {
  return {
    id: view.id,
    name: view.name,
    type: view.type,
    balance: view.balanceCents,
  };
}

/** UC-1.2 — the accounts behind the sidebar's "In accounts now". */
export function registerAccountRoutes(
  app: FastifyInstance,
  { manageAccounts }: Dependencies,
): void {
  app.get('/accounts', async (): Promise<AccountsResponse> => {
    const view = await manageAccounts.list();

    return {
      accounts: view.accounts.map(toResponse),
      total: view.totalCents,
    };
  });

  app.post('/accounts', async (request, reply) => {
    const input = readOpenRequest(request.body);
    if (input === undefined) {
      return badRequest(reply, 'name, type e balance são obrigatórios.');
    }

    try {
      const opened = await manageAccounts.open({
        name: input.name,
        type: input.type,
        balanceCents: input.balance,
      });
      return await reply.status(201).send(toResponse(opened));
    } catch (error) {
      return handle(error, reply);
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/accounts/:id/name',
    async (request, reply) => {
      const { name } = (asRecord(request.body) ??
        {}) as Partial<RenameAccountRequest>;
      if (typeof name !== 'string') {
        return badRequest(reply, 'name é obrigatório.');
      }

      try {
        return toResponse(await manageAccounts.rename(request.params.id, name));
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/accounts/:id/balance',
    async (request, reply) => {
      const { balance } = (asRecord(request.body) ??
        {}) as Partial<CorrectBalanceRequest>;
      if (typeof balance !== 'number') {
        return badRequest(reply, 'balance é obrigatório.');
      }

      try {
        return toResponse(
          await manageAccounts.correctBalance(request.params.id, balance),
        );
      } catch (error) {
        return handle(error, reply);
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/accounts/:id',
    async (request, reply) => {
      try {
        await manageAccounts.close(request.params.id);
        return await reply.status(204).send();
      } catch (error) {
        return handle(error, reply);
      }
    },
  );
}

function badRequest(reply: FastifyReply, message: string) {
  return reply.status(400).send({ error: message });
}

function handle(error: unknown, reply: FastifyReply) {
  if (error instanceof AccountNotFound) {
    return reply.status(404).send({ error: error.message });
  }
  if (error instanceof InvalidAccount || error instanceof InvalidAmount) {
    return badRequest(reply, error.message);
  }
  throw error;
}
