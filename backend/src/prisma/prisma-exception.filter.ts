import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AllExceptionsFilter } from '../common/all-exceptions.filter.js';
import { Prisma } from '../generated/prisma/client.js';

/**
 * Maps well-known Prisma errors to HTTP errors; everything else falls through
 * as a 500. Extends `AllExceptionsFilter` so the mapped errors come out in the
 * same envelope as every other error.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends AllExceptionsFilter {
  constructor(httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost);
  }

  override catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    switch (exception.code) {
      case 'P2002':
        return super.catch(new ConflictException('A record with this value already exists'), host);
      case 'P2025':
        return super.catch(new NotFoundException('Record not found'), host);
      // A Postgres error the driver adapter has no code for, e.g. an exclusion
      // constraint (23P01) such as the one that keeps shifts from overlapping.
      case 'P2039':
        if (sqlState(exception) === '23P01') {
          return super.catch(new ConflictException('Overlaps another shift of the same person'), host);
        }
        return super.catch(exception, host);
      default:
        return super.catch(exception, host);
    }
  }
}

/** The Postgres SQLSTATE behind a driver-adapter error, when there is one. */
function sqlState(exception: Prisma.PrismaClientKnownRequestError): string | undefined {
  const adapterError = exception.meta?.driverAdapterError as { cause?: { originalCode?: unknown } } | undefined;
  const code = adapterError?.cause?.originalCode;
  return typeof code === 'string' ? code : undefined;
}
