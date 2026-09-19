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

export const AI_PROVIDERS = ['anthropic', 'openai', 'google', 'gateway'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

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

    THROTTLE_TTL_MS: int(60_000, 1_000),
    THROTTLE_LIMIT: int(100, 1),
    THROTTLE_LOGIN_LIMIT: int(5, 1),
    THROTTLE_REFRESH_LIMIT: int(30, 1),
    THROTTLE_CHAT_LIMIT: int(20, 1),

    AI_PROVIDER: z.preprocess(blankToUndefined, z.enum(AI_PROVIDERS).default('anthropic')),
    AI_MODEL: z.preprocess(blankToUndefined, z.string().min(1).default('claude-opus-5')),
    AI_MAX_OUTPUT_TOKENS: int(64_000, 256, 128_000),
    AI_MAX_STEPS: int(5, 1, 20),
    AI_EFFORT: z.preprocess(
      blankToUndefined,
      z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    ),
    AI_SEND_REASONING: booleanFlag(true),
    AI_REFUSAL_FALLBACK: booleanFlag(true),

    ANTHROPIC_API_KEY: optionalString,
    OPENAI_API_KEY: optionalString,
    GOOGLE_GENERATIVE_AI_API_KEY: optionalString,
    AI_GATEWAY_API_KEY: optionalString,
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
    if (!aiApiKeyFor(env)) {
      ctx.addIssue({
        code: 'custom',
        path: [AI_KEY_VARS[env.AI_PROVIDER]],
        message: `is required when AI_PROVIDER=${env.AI_PROVIDER} in production`,
      });
    }
  });

export type Env = z.output<typeof EnvSchema>;

export const AI_KEY_VARS = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
} as const satisfies Record<AiProvider, keyof Env>;

export function aiApiKeyFor(env: Pick<Env, 'AI_PROVIDER' | (typeof AI_KEY_VARS)[AiProvider]>) {
  return env[AI_KEY_VARS[env.AI_PROVIDER]];
}

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
