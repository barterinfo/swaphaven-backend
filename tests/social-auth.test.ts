/**
 * Unit tests for src/lib/social-auth.ts.
 *
 * We use vi.resetModules() + vi.doMock() + dynamic import per test so the module is
 * freshly initialised with the env under test. Avoid a shared beforeEach that resets
 * mocks — it races with per-test setupMocks() and can leave Facebook creds unset.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
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
