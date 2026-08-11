import { PrismaClient } from '@prisma/client';

export const brokenClient = (): PrismaClient => new PrismaClient();
