import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';

/**
 * The envelope every error response uses. Whatever the thrower supplied is
 * preserved, so handler-specific fields (`code`, validation details) survive.
 */
export interface ErrorResponseBody {
  statusCode: number;
  message: unknown;
  timestamp: string;
  path: string;
  [key: string]: unknown;
}

/**
 * Last-resort filter: gives every error one shape, logs unexpected throws with
 * their stack, and never lets an internal message reach the client.
 *
 * Registered *before* the more specific filters in `AppModule`: Nest matches
 * global filters in reverse registration order, so this one is consulted last.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<unknown>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // A response that has already started streaming (the chat SSE endpoint) is
    // past the point where status or body can change — just close it.
    if (httpAdapter.isHeadersSent(response)) {
      httpAdapter.end(response);
      return;
    }

    httpAdapter.reply(response, this.buildBody(exception, status, request.originalUrl), status);
  }

  private buildBody(exception: unknown, status: number, path: string): ErrorResponseBody {
    const context = { timestamp: new Date().toISOString(), path };

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      return typeof payload === 'object' && payload !== null
        ? { statusCode: status, message: exception.message, ...payload, ...context }
        : { statusCode: status, message: payload, ...context };
    }

    // Never surface the details of an unexpected failure; they are in the log.
    return { statusCode: status, message: 'Internal server error', ...context };
  }
}
