/**
 * Unit tests for src/lib/social-auth.ts.
 *
 * We use vi.resetModules() + vi.doMock() + dynamic import per test so the module is
 * freshly initialised with the env under test. Avoid a shared beforeEach that resets
 * mocks — it races with per-test setupMocks() and can leave Facebook creds unset.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { createHash, generateKeyPairSync } from "crypto";
import jwt from "jsonwebtoken";
import type { SocialAuthError as SocialAuthErrorType, verifySocialToken as VerifyFn } from "../src/lib/social-auth.js";

const verifyIdToken = vi.fn();
const FB_APP_ID = "12345";
const FB_APP_SECRET = "fb-secret";

type EnvOverrides = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_IOS_CLIENT_ID?: string;
  GOOGLE_ANDROID_CLIENT_ID?: string;
  FACEBOOK_APP_ID?: string;
  FACEBOOK_APP_SECRET?: string;
  IOS_BUNDLE_ID?: string;
  APPLE_CLIENT_IDS?: string;
};

function setupMocks(envOverrides: EnvOverrides = {}) {
  vi.resetModules();

  vi.doMock("google-auth-library", () => ({
    OAuth2Client: class {
      verifyIdToken = verifyIdToken;
    },
  }));

  vi.doMock("../src/config/env.js", () => ({
    env: {
      GOOGLE_CLIENT_ID: "test-client-id",
      GOOGLE_IOS_CLIENT_ID: undefined,
      GOOGLE_ANDROID_CLIENT_ID: undefined,
      FACEBOOK_APP_ID: undefined,
      FACEBOOK_APP_SECRET: undefined,
      IOS_BUNDLE_ID: "com.barter.app.barterMobile",
      APPLE_CLIENT_IDS: undefined,
      ...envOverrides,
    },
  }));

  verifyIdToken.mockReset();
}

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadLibWithEnv(envOverrides: EnvOverrides = {}) {
  setupMocks(envOverrides);
  return import("../src/lib/social-auth.js") as Promise<{
    verifySocialToken: typeof VerifyFn;
    SocialAuthError: typeof SocialAuthErrorType;
  }>;
}

function mockFacebookFetch(opts: {
  debugToken?: { is_valid: boolean; app_id?: string | number };
  debugStatus?: number;
  debugThrows?: boolean;
  me?: { id: string; name: string; email: string };
  meThrows?: boolean;
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = String(url);
    if (u.includes("/debug_token")) {
      if (opts.debugThrows) throw new Error("ECONNREFUSED");
      if (opts.debugStatus !== undefined && opts.debugStatus !== 200) {
        return new Response("{}", { status: opts.debugStatus });
      }
      return new Response(
        JSON.stringify({
          data: opts.debugToken ?? { is_valid: true, app_id: FB_APP_ID },
        }),
        { status: 200 },
      );
    }
    if (u.includes("/me")) {
      if (opts.meThrows) throw new Error("ECONNREFUSED");
      return new Response(
        JSON.stringify(opts.me ?? { id: "1", name: "FB User", email: "fb@test.com" }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected fetch: ${u}`);
  });
}

describe("verifySocialToken — Google", () => {
  it("maps a network-code rejection to 502 bad_gateway", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    verifyIdToken.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });

  it("maps an upstream 5xx rejection to 502 bad_gateway", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    verifyIdToken.mockRejectedValueOnce({ response: { status: 503 } });

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
  });

  it("maps an invalid-token rejection to 401 unauthorized", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    verifyIdToken.mockRejectedValueOnce(new Error("Invalid token signature"));

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  it("returns the verified profile for a valid token", async () => {
    const { verifySocialToken } = await loadLibWithEnv();
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: "g@test.com", email_verified: true, name: "G User" }),
    });

    await expect(verifySocialToken("google", "tok")).resolves.toEqual({
      email: "g@test.com",
      name: "G User",
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "tok",
      audience: ["test-client-id"],
    });
  });

  it("passes all configured Google client IDs as verifyIdToken audiences", async () => {
    const { verifySocialToken } = await loadLibWithEnv({
      GOOGLE_CLIENT_ID: "web-id",
      GOOGLE_IOS_CLIENT_ID: "ios-id",
      GOOGLE_ANDROID_CLIENT_ID: "android-id",
    });
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: "g@test.com", email_verified: true, name: "G User" }),
    });

    await expect(verifySocialToken("google", "tok")).resolves.toEqual({
      email: "g@test.com",
      name: "G User",
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "tok",
      audience: ["web-id", "ios-id", "android-id"],
    });
  });

  it("succeeds with only a mobile Google client ID configured", async () => {
    const { verifySocialToken } = await loadLibWithEnv({
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_IOS_CLIENT_ID: "ios-id",
    });
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: "g@test.com", email_verified: true, name: "G User" }),
    });

    await expect(verifySocialToken("google", "tok")).resolves.toEqual({
      email: "g@test.com",
      name: "G User",
    });
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: "tok",
      audience: ["ios-id"],
    });
  });

  it("returns 503 when no Google client IDs are configured", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      GOOGLE_CLIENT_ID: undefined,
    });

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("unavailable");
    expect(err.message).toBe("Google sign-in is not configured");
  });
});

describe("verifySocialToken — Facebook", () => {
  it("returns 503 when Facebook credentials are absent", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("unavailable");
    expect(err.message).toBe("Facebook sign-in is not configured");
  });

  it("returns 503 when only one Facebook credential is set", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
    });

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(503);
    expect(err.message).toBe("Facebook sign-in is misconfigured");
  });

  it("returns 401 when debug_token reports is_valid false", async () => {
    mockFacebookFetch({ debugToken: { is_valid: false, app_id: FB_APP_ID } });
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Facebook token was not issued for this app");
  });

  it("returns 401 when debug_token app_id mismatches", async () => {
    mockFacebookFetch({ debugToken: { is_valid: true, app_id: "other-app" } });
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
  });

  it("accepts numeric app_id from debug_token when env id is a string", async () => {
    mockFacebookFetch({ debugToken: { is_valid: true, app_id: 12345 } });
    const { verifySocialToken } = await loadLibWithEnv({
      FACEBOOK_APP_ID: "12345",
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    await expect(verifySocialToken("facebook", "tok")).resolves.toEqual({
      email: "fb@test.com",
      name: "FB User",
    });
  });

  it("returns profile when debug_token and /me succeed", async () => {
    mockFacebookFetch({});
    const { verifySocialToken } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    await expect(verifySocialToken("facebook", "tok")).resolves.toEqual({
      email: "fb@test.com",
      name: "FB User",
    });
  });

  it("maps debug_token network failure to 502 bad_gateway", async () => {
    mockFacebookFetch({ debugThrows: true });
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });

  it("sends the access token via the Authorization header, not the query string", async () => {
    const fetchSpy = mockFacebookFetch({});
    const { verifySocialToken } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    await expect(verifySocialToken("facebook", "secret-token")).resolves.toEqual({
      email: "fb@test.com",
      name: "FB User",
    });

    const meCall = fetchSpy.mock.calls.find(([url]) => String(url).includes("/me"));
    expect(meCall).toBeTruthy();
    const [calledUrl, opts] = meCall!;
    expect(String(calledUrl)).toContain("/v21.0/me");
    expect(String(calledUrl)).not.toContain("secret-token");
    expect((opts as RequestInit | undefined)?.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("maps a /me transport failure to 502 bad_gateway", async () => {
    mockFacebookFetch({ meThrows: true });
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      FACEBOOK_APP_ID: FB_APP_ID,
      FACEBOOK_APP_SECRET: FB_APP_SECRET,
    });

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });
});

const APPLE_KID = "test-kid";
const APPLE_RAW_NONCE = "raw-nonce-value";
const APPLE_HASHED_NONCE = createHash("sha256").update(APPLE_RAW_NONCE, "utf8").digest("hex");
const appleKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const appleJwk = {
  ...appleKeys.publicKey.export({ format: "jwk" }),
  kid: APPLE_KID,
  alg: "RS256",
  use: "sig",
  kty: "RSA",
};

function signAppleIdToken(payload: object, opts?: jwt.SignOptions) {
  return jwt.sign(payload, appleKeys.privateKey, {
    algorithm: "RS256",
    issuer: "https://appleid.apple.com",
    audience: "com.barter.app.barterMobile",
    expiresIn: "1h",
    keyid: APPLE_KID,
    ...opts,
  });
}

function mockAppleJwks(opts: { status?: number; throws?: boolean; keys?: unknown[] } = {}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (!String(url).includes("appleid.apple.com/auth/keys")) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    if (opts.throws) throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    if (opts.status !== undefined && opts.status !== 200) {
      return new Response("{}", { status: opts.status });
    }
    return new Response(JSON.stringify({ keys: opts.keys ?? [appleJwk] }), { status: 200 });
  });
}

describe("verifySocialToken — Apple", () => {
  const validPayload = {
    nonce: APPLE_HASHED_NONCE,
    email: "ada@privaterelay.appleid.com",
    email_verified: "true",
    sub: "apple.sub.1",
  };

  it("returns the verified profile for a valid identity token", async () => {
    mockAppleJwks();
    const { verifySocialToken } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload);

    await expect(
      verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE, fullName: "Ada Lovelace" }),
    ).resolves.toEqual({
      email: "ada@privaterelay.appleid.com",
      name: "Ada Lovelace",
      appleSub: "apple.sub.1",
    });
  });

  it("falls back to the email local-part when fullName is omitted", async () => {
    mockAppleJwks();
    const { verifySocialToken } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload);

    await expect(verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE })).resolves.toMatchObject({
      email: "ada@privaterelay.appleid.com",
      name: "ada",
      appleSub: "apple.sub.1",
    });
  });

  it("returns appleSub without email when Apple omits the email claim", async () => {
    mockAppleJwks();
    const { verifySocialToken } = await loadLibWithEnv();
    const idToken = signAppleIdToken({ nonce: APPLE_HASHED_NONCE, sub: "apple.sub.1" });

    await expect(
      verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE, fullName: "Ada" }),
    ).resolves.toEqual({
      name: "Ada",
      appleSub: "apple.sub.1",
    });
  });

  it("accepts the UAT bundle id as audience", async () => {
    mockAppleJwks();
    const { verifySocialToken } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload, { audience: "com.barter.app.barterMobile.uat" });

    await expect(
      verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE }),
    ).resolves.toMatchObject({ appleSub: "apple.sub.1" });
  });

  it("accepts an extra audience from APPLE_CLIENT_IDS", async () => {
    mockAppleJwks();
    const { verifySocialToken } = await loadLibWithEnv({
      APPLE_CLIENT_IDS: "com.barter.app.service",
    });
    const idToken = signAppleIdToken(validPayload, { audience: "com.barter.app.service" });

    await expect(
      verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE }),
    ).resolves.toMatchObject({ appleSub: "apple.sub.1" });
  });

  it("maps a nonce mismatch to 401 unauthorized", async () => {
    mockAppleJwks();
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload);

    const err = await verifySocialToken("apple", idToken, { nonce: "wrong-nonce" }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
    expect(err.message).toBe("Invalid Apple token nonce");
  });

  it("maps a missing nonce to 401 unauthorized", async () => {
    mockAppleJwks();
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload);

    const err = await verifySocialToken("apple", idToken).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Apple nonce is required");
  });

  it("maps an unverified email to 401 unauthorized", async () => {
    mockAppleJwks();
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    const idToken = signAppleIdToken({ ...validPayload, email_verified: "false" });

    const err = await verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.message).toBe("Apple account email is missing or unverified");
  });

  it("maps a JWKS transport failure to 502 bad_gateway", async () => {
    mockAppleJwks({ throws: true });
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();
    const idToken = signAppleIdToken(validPayload);

    const err = await verifySocialToken("apple", idToken, { nonce: APPLE_RAW_NONCE }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });

  it("maps an invalid identity token to 401 unauthorized", async () => {
    mockAppleJwks();
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv();

    const err = await verifySocialToken("apple", "not-a-jwt", { nonce: APPLE_RAW_NONCE }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
  });

  it("returns 503 when no Apple audiences are configured", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLibWithEnv({
      IOS_BUNDLE_ID: undefined,
    });

    const err = await verifySocialToken("apple", "tok", { nonce: APPLE_RAW_NONCE }).catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("unavailable");
    expect(err.message).toBe("Apple sign-in is not configured");
  });
});
