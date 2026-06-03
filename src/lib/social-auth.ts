import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";

export type SocialProvider = "google" | "facebook";

export interface SocialProfile {
  email: string;
  name: string;
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

const googleClient = env.GOOGLE_CLIENT_ID ? new OAuth2Client(env.GOOGLE_CLIENT_ID) : null;

/** Pinned Graph API version so behaviour does not drift with Facebook's rolling default. */
const FB_GRAPH = "https://graph.facebook.com/v21.0";

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

async function verifyGoogle(idToken: string): Promise<SocialProfile> {
  if (!googleClient) {
    throw new SocialAuthError("Google sign-in is not configured", 503, "unavailable");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience: env.GOOGLE_CLIENT_ID });
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

/** Verify a provider token and return the verified email + display name. */
export function verifySocialToken(provider: SocialProvider, idToken: string): Promise<SocialProfile> {
  return provider === "google" ? verifyGoogle(idToken) : verifyFacebook(idToken);
}
