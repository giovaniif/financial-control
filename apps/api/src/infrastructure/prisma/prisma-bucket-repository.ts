import type { PrismaClient } from '@prisma/client';

import type { Bucket } from '../../domain/goals/bucket.js';
import type { BucketRepository } from '../../domain/ports/repositories.js';
import { fromBucket, toBucket } from './mappers/bucket-mapper.js';

/** Ordered by sequence: the fold over the log depends on the order. */
const withEvents = { events: { orderBy: { sequence: 'asc' } } } as const;

export class PrismaBucketRepository implements BucketRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAll(): Promise<Bucket[]> {
    const rows = await this.prisma.bucket.findMany({
      include: withEvents,
      orderBy: { priority: 'asc' },
    });

    return rows.map(toBucket);
  }

  async findById(id: string): Promise<Bucket | undefined> {
    const row = await this.prisma.bucket.findUnique({
      where: { id },
      include: withEvents,
    });

    return row === null ? undefined : toBucket(row);
  }

  async save(bucket: Bucket): Promise<void> {
    const { header, events } = fromBucket(bucket);

    await this.prisma.$transaction([
      this.prisma.bucket.upsert({
        where: { id: header.id },
        create: header,
        update: header,
      }),
      this.prisma.bucketEvent.deleteMany({ where: { bucketId: header.id } }),
      this.prisma.bucketEvent.createMany({
        data: events.map((event) => ({ ...event, bucketId: header.id })),
      }),
    ]);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.bucket.delete({ where: { id } });
  }
}
