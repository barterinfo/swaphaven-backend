import { z } from "zod";

/** Railway UI values pasted from .env often include wrapping quotes — strip them. */
function normalizeEnv(raw: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    let v = value.trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1).trim();
    }
    out[key] = v;
  }
  return out;
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 chars"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("30d"),
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),
  API_RATE_LIMIT_MAX: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(15 * 60 * 1000),
  /** Behind Railway / reverse proxy. Defaults to true when NODE_ENV=production. */
  TRUST_PROXY: z.enum(["true", "false"]).optional(),
  /** Swagger UI at /api-docs. Default off in production. */
  ENABLE_API_DOCS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  /** Public base URL for docs / clients (e.g. https://api.swaphaven.io). */
  PUBLIC_API_URL: z.string().url().optional(),
  /** Google OAuth Web Client ID — primary audience for server-side token verification. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  /** Google OAuth iOS Client ID — accepted as an additional audience when set (for apps without GIDServerClientID). */
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),
  /** Google OAuth Android Client ID — accepted as an additional audience when set. */
  GOOGLE_ANDROID_CLIENT_ID: z.string().optional(),
  /** Facebook app credentials — when both set, social login confirms tokens were issued to this app. */
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  // ─── S3 media (optional — presigned uploads at POST /api/media/presign) ───
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_MEDIA_BUCKET: z.string().optional(),
  S3_MEDIA_PREFIX: z.string().default("listings"),
  S3_PRESIGN_EXPIRES_SEC: z.coerce.number().int().min(60).max(3600).default(300),
  CDN_BASE_URL: z.string().url().optional(),
  /** Firebase Admin service-account JSON (stringified). When set, push
   *  notifications are delivered via FCM. Omit in dev/test to disable push. */
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

const parsed = envSchema.safeParse(normalizeEnv(process.env));

if (!parsed.success) {
  console.error("❌  Invalid environment variables:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const data = parsed.data;

if (data.DATABASE_URL.includes("${{")) {
  console.error(
    "❌  DATABASE_URL looks like an unresolved Railway reference.\n" +
      "   In Railway → API service → Variables → use **Add Reference** → Postgres → DATABASE_URL,\n" +
      "   do not paste the text ${{Postgres.DATABASE_URL}} manually.",
  );
  process.exit(1);
}

export const env = {
  ...data,
  // Vitest registers many users against one app instance — avoid 429s in CI/local test runs.
  AUTH_RATE_LIMIT_MAX: data.NODE_ENV === "test" ? 10_000 : data.AUTH_RATE_LIMIT_MAX,
  API_RATE_LIMIT_MAX: data.NODE_ENV === "test" ? 100_000 : data.API_RATE_LIMIT_MAX,
  TRUST_PROXY:
    data.TRUST_PROXY === "true" ||
    (data.TRUST_PROXY !== "false" && data.NODE_ENV === "production"),
  ENABLE_API_DOCS:
    data.ENABLE_API_DOCS ??
    (data.NODE_ENV !== "production"),
};

export type Env = typeof env;
