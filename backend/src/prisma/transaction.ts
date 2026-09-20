import type { Prisma } from '../generated/prisma/client.js';

/**
 * Either the root Prisma client or an interactive transaction client.
 * Repositories take this as an optional last argument so the same method can
 * run standalone or as one step of a larger transaction.
 */
export type Db = Prisma.TransactionClient;
