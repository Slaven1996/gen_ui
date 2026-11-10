import { isTimeZone } from '@gen-ui/shared';
import { z } from 'zod';

/** Treat empty env values (`FOO=`) as "not set". */
const blankToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().trim().optional());

const booleanFlag = (fallback: boolean) =>
  z.preprocess(
    blankToUndefined,
    z
      .enum(['true', 'false', '1', '0'])
      .transform((value) => value === 'true' || value === '1')
      .default(fallback),
  );

const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.preprocess(blankToUndefined, z.coerce.number().int().min(min).max(max).default(fallback));

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: int(3000, 1, 65535),
    /** `false`, `true`, or a hop count — passed to Express `trust proxy`. */
    TRUST_PROXY: z
      .preprocess(blankToUndefined, z.string().default('false'))
      .transform((value): boolean | number =>
        /^\d+$/.test(value) ? Number(value) : value === 'true',
      ),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

    JWT_ACCESS_SECRET: z.string().min(32, 'must be at least 32 characters (openssl rand -base64 48)'),
    JWT_ACCESS_TTL: int(900, 10, 86_400),
    JWT_ISSUER: z.string().min(1).default('gen-ui-api'),
    JWT_AUDIENCE: z.string().min(1).default('gen-ui-web'),

    REFRESH_TOKEN_TTL_DAYS: int(7, 1, 90),
    REFRESH_TOKEN_REUSE_GRACE_SECONDS: int(10, 0, 120),
    /** Expired refresh tokens are deleted once they are this many days past expiry. */
    REFRESH_TOKEN_PRUNE_AFTER_DAYS: int(30, 1, 3650),
    REFRESH_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('refresh_token'),

    COOKIE_SECURE: booleanFlag(false),
    COOKIE_DOMAIN: optionalString,
    CORS_ORIGIN: optionalString.transform((value) =>
      value
        ? value
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
        : [],
    ),

    AI_MAX_OUTPUT_TOKENS: int(64_000, 256, 128_000),
    AI_MAX_STEPS: int(10, 1, 20),
    AI_SEND_REASONING: booleanFlag(true),
    AI_REFUSAL_FALLBACK: booleanFlag(true),
    /**
     * The longest device, tag or alarm rule list the assistant's prompt carries; a longer one
     * is left out, and the assistant looks up what it needs. 0 leaves all three out.
     */
    AI_PICK_LIST_INLINE_MAX: int(100, 0, 2000),

    /** Writes plausible readings for every tag of an ONLINE device, so charts and alarms move in a demo. */
    SIMULATOR_ENABLED: booleanFlag(true),
    SIMULATOR_INTERVAL_SECONDS: int(60, 5, 3600),
    /** Measurements older than this are deleted by a daily job. */
    TELEMETRY_RETENTION_DAYS: int(180, 1, 3650),

    /** Demo: a made-up alarm notification for every active user every 60 s, 40% of the time, while someone is online. */
    MOCK_ALARM_NOTIFICATIONS: booleanFlag(true),
    /** Notifications older than this, read or not, are deleted by a daily job. */
    NOTIFICATION_RETENTION_DAYS: int(30, 1, 3650),

    /** The plant's IANA zone: shift templates' times and the shift calendar's days are in it. */
    SHIFT_TIME_ZONE: z.preprocess(
      blankToUndefined,
      z
        .string()
        .trim()
        .refine(isTimeZone, 'must be an IANA time zone such as Europe/Budapest')
        .default('Europe/Budapest'),
    ),

    /** The assistant's only provider. Without it the chat answers 503 and the rest of the app runs. */
    ANTHROPIC_API_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    if (!env.COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'must be true in production',
      });
    }
    if (!env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['ANTHROPIC_API_KEY'],
        message: 'is required in production',
      });
    }
  });

export type Env = z.output<typeof EnvSchema>;

/** `ConfigModule.forRoot({ validate })` hook: fail fast with a readable list of problems. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration (backend/.env):\n${problems}`);
  }
  return result.data;
}
