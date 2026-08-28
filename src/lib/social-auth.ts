import crypto from "crypto";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

export type SocialProvider = "google" | "facebook" | "apple";

export interface SocialProfile {
  email?: string;
  name: string;
  /** Present for Apple — stable user id from the identity token `sub` claim. */
  appleSub?: string;
}

/** Extra claims the Apple client sends alongside the identity token. */
export interface SocialVerifyOptions {
  /** Raw nonce whose SHA-256 hex must match the identity token's `nonce` claim. */
  nonce?: string;
  /** Display name from Apple's first-authorization credential (not in the JWT). */
  fullName?: string;
}

/** Raised when a social token cannot be verified; `status`/`code` map to the HTTP response. */
export class SocialAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "SocialAuthError";
  }
}

/** All accepted Google OAuth client IDs (web + any mobile clients). */
function googleAudiences(): string[] {
  return [env.GOOGLE_CLIENT_ID, env.GOOGLE_IOS_CLIENT_ID, env.GOOGLE_ANDROID_CLIENT_ID].filter(
    (id): id is string => Boolean(id),
  );
}

const googleClient = googleAudiences().length > 0 ? new OAuth2Client() : null;

/** Pinned Graph API version so behaviour does not drift with Facebook's rolling default. */
const FB_GRAPH = "https://graph.facebook.com/v21.0";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_JWKS_TTL_MS = 60 * 60 * 1000;

interface AppleJwk {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
  alg?: string;
  use?: string;
}

let appleJwksCache: { fetchedAt: number; keys: AppleJwk[] } | null = null;

const TRANSPORT_CODES = new Set([
  "ETIMEDOUT", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EPIPE",
]);

/** True when an error looks like a network/transport failure rather than an invalid token. */
function isTransportError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  if (code && TRANSPORT_CODES.has(code)) return true;
  // Gaxios surfaces upstream HTTP failures (e.g. Google cert endpoint 5xx) on `response.status`.
  const status = (err as { response?: { status?: number } })?.response?.status;
  return typeof status === "number" && status >= 500;
}

/** Derive a display name from a profile name, falling back to the email local-part. */
function nameFor(name: string | undefined | null, email: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : email.split("@")[0];
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function verifyGoogle(idToken: string): Promise<SocialProfile> {
  const audiences = googleAudiences();
  if (!googleClient || audiences.length === 0) {
    throw new SocialAuthError("Google sign-in is not configured", 503, "unavailable");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: audiences });
    payload = ticket.getPayload();
  } catch (err) {
    // Distinguish "Google is unreachable" from "the token is invalid" so clients can retry.
    if (isTransportError(err)) {
      throw new SocialAuthError("Could not reach Google", 502, "bad_gateway");
    }
    throw new SocialAuthError("Invalid Google token", 401, "unauthorized");
  }

  if (!payload?.email || !payload.email_verified) {
    throw new SocialAuthError("Google account email is missing or unverified", 401, "unauthorized");
  }

  return { email: payload.email, name: nameFor(payload.name, payload.email) };
}

/**
 * When app credentials are configured, confirm the user access token was actually issued to
 * *our* Facebook app (Graph `/me` alone accepts any valid token from any app).
 */
async function assertFacebookAppToken(accessToken: string): Promise<void> {
  const hasId = Boolean(env.FACEBOOK_APP_ID);
  const hasSecret = Boolean(env.FACEBOOK_APP_SECRET);
  if (hasId !== hasSecret) {
    throw new SocialAuthError("Facebook sign-in is misconfigured", 503, "unavailable");
  }
  if (!hasId) {
    throw new SocialAuthError("Facebook sign-in is not configured", 503, "unavailable");
  }

  const appToken = `${env.FACEBOOK_APP_ID}|${env.FACEBOOK_APP_SECRET}`;
  const url =
    `${FB_GRAPH}/debug_token?input_token=${encodeURIComponent(accessToken)}` +
    `&access_token=${encodeURIComponent(appToken)}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new SocialAuthError("Could not reach Facebook", 502, "bad_gateway");
  }

  if (!res.ok) {
    throw new SocialAuthError("Invalid Facebook token", 401, "unauthorized");
  }

  const body = (await res.json()) as { data?: { is_valid?: boolean; app_id?: string | number } };
  if (!body.data?.is_valid || String(body.data.app_id) !== env.FACEBOOK_APP_ID) {
    throw new SocialAuthError("Facebook token was not issued for this app", 401, "unauthorized");
  }
}

async function verifyFacebook(accessToken: string): Promise<SocialProfile> {
  await assertFacebookAppToken(accessToken);

  let res: Response;
  try {
    // Send the token in the Authorization header — query-string tokens leak into proxy/APM logs.
    res = await fetch(`${FB_GRAPH}/me?fields=id,name,email`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new SocialAuthError("Could not reach Facebook", 502, "bad_gateway");
  }

  if (!res.ok) {
    throw new SocialAuthError("Invalid Facebook token", 401, "unauthorized");
  }

  const data = (await res.json()) as { id?: string; name?: string; email?: string };
  if (!data.email) {
    throw new SocialAuthError("Facebook account has no email", 401, "unauthorized");
  }

  return { email: data.email, name: nameFor(data.name, data.email) };
}

/**
 * iOS bundle id (prod + `.uat` flavour) plus any extra Services IDs in `APPLE_CLIENT_IDS`.
 * Native Sign in with Apple puts the bundle id in the identity token `aud` claim.
 */
function appleAudiences(): string[] {
  const extras = (env.APPLE_CLIENT_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const bundle = env.IOS_BUNDLE_ID;
  const uatBundle = bundle && !bundle.endsWith(".uat") ? `${bundle}.uat` : bundle;
  return [...new Set([bundle, uatBundle, ...extras].filter(Boolean))];
}

async function loadAppleJwks(force: boolean): Promise<AppleJwk[]> {
  if (!force && appleJwksCache && Date.now() - appleJwksCache.fetchedAt < APPLE_JWKS_TTL_MS) {
    return appleJwksCache.keys;
  }

  let res: Response;
  try {
    res = await fetch(APPLE_JWKS_URL, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    if (isTransportError(err) || err instanceof Error) {
      throw new SocialAuthError("Could not reach Apple", 502, "bad_gateway");
    }
    throw new SocialAuthError("Could not reach Apple", 502, "bad_gateway");
  }

  if (!res.ok) {
    throw new SocialAuthError("Could not reach Apple", 502, "bad_gateway");
  }

  const body = (await res.json()) as { keys?: AppleJwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  appleJwksCache = { fetchedAt: Date.now(), keys };
  return keys;
}

async function applePublicKeyForKid(kid: string): Promise<crypto.KeyObject> {
  const find = async (force: boolean): Promise<crypto.KeyObject | null> => {
    const keys = await loadAppleJwks(force);
    const jwk = keys.find((key) => key.kid === kid);
    if (!jwk) return null;
    try {
      return crypto.createPublicKey({
        key: jwk as crypto.JsonWebKey,
        format: "jwk",
      });
    } catch {
      return null;
    }
  };

  const cached = await find(false);
  if (cached) return cached;
  const rotated = await find(true);
  if (rotated) return rotated;
  throw new SocialAuthError("Invalid Apple token", 401, "unauthorized");
}

function isAppleEmailVerified(value: unknown): boolean {
  return value === true || value === "true";
}

async function verifyApple(idToken: string, options?: SocialVerifyOptions): Promise<SocialProfile> {
  const audiences = appleAudiences();
  if (audiences.length === 0) {
    throw new SocialAuthError("Apple sign-in is not configured", 503, "unavailable");
  }

  const rawNonce = options?.nonce?.trim();
  if (!rawNonce) {
    throw new SocialAuthError("Apple nonce is required", 401, "unauthorized");
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    throw new SocialAuthError("Invalid Apple token", 401, "unauthorized");
  }

  const publicKey = await applePublicKeyForKid(decoded.header.kid);

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      issuer: APPLE_ISSUER,
      audience: [audiences[0], ...audiences.slice(1)],
      clockTolerance: 60,
    }) as jwt.JwtPayload;
  } catch (err) {
    if (isTransportError(err)) {
      throw new SocialAuthError("Could not reach Apple", 502, "bad_gateway");
    }
    throw new SocialAuthError("Invalid Apple token", 401, "unauthorized");
  }

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub) {
    throw new SocialAuthError("Invalid Apple token", 401, "unauthorized");
  }

  const nonceClaim = typeof payload.nonce === "string" ? payload.nonce : "";
  if (!timingSafeEqualString(nonceClaim, sha256Hex(rawNonce))) {
    throw new SocialAuthError("Invalid Apple token nonce", 401, "unauthorized");
  }

  const email = typeof payload.email === "string" && payload.email.includes("@")
    ? payload.email.trim()
    : undefined;
  if (email && !isAppleEmailVerified(payload.email_verified)) {
    throw new SocialAuthError("Apple account email is missing or unverified", 401, "unauthorized");
  }

  return {
    ...(email ? { email } : {}),
    name: nameFor(options?.fullName, email ?? "user"),
    appleSub: sub,
  };
}

/** Verify a provider token and return the verified email + display name. */
export function verifySocialToken(
  provider: SocialProvider,
  idToken: string,
  options?: SocialVerifyOptions,
): Promise<SocialProfile> {
  if (provider === "google") return verifyGoogle(idToken);
  if (provider === "facebook") return verifyFacebook(idToken);
  return verifyApple(idToken, options);
}
