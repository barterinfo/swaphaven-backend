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
  } catch {
    throw new SocialAuthError("Invalid Google token", 401, "unauthorized");
  }

  if (!payload?.email || !payload.email_verified) {
    throw new SocialAuthError("Google account email is missing or unverified", 401, "unauthorized");
  }

  return { email: payload.email, name: nameFor(payload.name, payload.email) };
}

async function verifyFacebook(accessToken: string): Promise<SocialProfile> {
  const url = `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;

  let res: Response;
  try {
    res = await fetch(url);
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
