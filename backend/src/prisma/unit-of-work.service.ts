import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import type { Db } from './transaction.js';

/**
 * Runs several repository calls as a single database transaction, so service
 * code can state "these steps are atomic" without depending on Prisma itself.
 * Throwing from `work` rolls the whole thing back.
 */
@Injectable()
export class UnitOfWork {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(work: (db: Db) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work);
  }
}
