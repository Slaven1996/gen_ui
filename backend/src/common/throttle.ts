import { Throttle } from '@nestjs/throttler';
import type { Env } from '../config/env.schema.js';

type ThrottleLimitKey = Extract<keyof Env, `THROTTLE_${string}_LIMIT`>;

/**
 * Per-route rate limit read from env at request time (decorators are evaluated
 * before ConfigModule loads, so the values are resolved lazily). ConfigModule
 * has already validated these variables by the time a request arrives.
 */
export const ThrottleFromEnv = (limitKey: ThrottleLimitKey) =>
  Throttle({
    default: {
      limit: () => Number(process.env[limitKey]),
      ttl: () => Number(process.env.THROTTLE_TTL_MS ?? 60_000),
    },
  });
