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
      default:
        return super.catch(exception, host);
    }
  }
}
