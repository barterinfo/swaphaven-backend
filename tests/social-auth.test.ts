/**
 * Unit tests for src/lib/social-auth.ts.
 *
 * We use vi.resetModules() + vi.doMock() + dynamic import inside beforeEach so the
 * module is freshly initialised for every test. This avoids the "cached module" problem
 * that can appear when auth.test.ts calls vi.importActual("social-auth.js") earlier in
 * the suite and the cached instance ignores our google-auth-library / env mocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SocialAuthError as SocialAuthErrorType, verifySocialToken as VerifyFn } from "../src/lib/social-auth.js";

const verifyIdToken = vi.fn();

beforeEach(async () => {
  vi.resetModules();

  vi.doMock("google-auth-library", () => ({
    OAuth2Client: class {
      verifyIdToken = verifyIdToken;
    },
  }));

  vi.doMock("../src/config/env.js", () => ({
    env: {
      GOOGLE_CLIENT_ID: "test-client-id",
      FACEBOOK_APP_ID: undefined,
      FACEBOOK_APP_SECRET: undefined,
    },
  }));

  verifyIdToken.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function loadLib() {
  return import("../src/lib/social-auth.js") as Promise<{
    verifySocialToken: typeof VerifyFn;
    SocialAuthError: typeof SocialAuthErrorType;
  }>;
}

describe("verifySocialToken — Google", () => {
  it("maps a network-code rejection to 502 bad_gateway", async () => {
    verifyIdToken.mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }));
    const { verifySocialToken, SocialAuthError } = await loadLib();

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });

  it("maps an upstream 5xx rejection to 502 bad_gateway", async () => {
    verifyIdToken.mockRejectedValueOnce({ response: { status: 503 } });
    const { verifySocialToken, SocialAuthError } = await loadLib();

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
  });

  it("maps an invalid-token rejection to 401 unauthorized", async () => {
    verifyIdToken.mockRejectedValueOnce(new Error("Invalid token signature"));
    const { verifySocialToken, SocialAuthError } = await loadLib();

    const err = await verifySocialToken("google", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthorized");
  });

  it("returns the verified profile for a valid token", async () => {
    verifyIdToken.mockResolvedValueOnce({
      getPayload: () => ({ email: "g@test.com", email_verified: true, name: "G User" }),
    });
    const { verifySocialToken } = await loadLib();

    await expect(verifySocialToken("google", "tok")).resolves.toEqual({
      email: "g@test.com",
      name: "G User",
    });
  });
});

describe("verifySocialToken — Facebook", () => {
  it("sends the access token via the Authorization header, not the query string", async () => {
    const { verifySocialToken } = await loadLib();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "1", name: "FB User", email: "fb@test.com" }), { status: 200 }),
    );

    await expect(verifySocialToken("facebook", "secret-token")).resolves.toEqual({
      email: "fb@test.com",
      name: "FB User",
    });

    const [calledUrl, opts] = fetchSpy.mock.calls[0];
    expect(String(calledUrl)).toContain("/v21.0/me");
    expect(String(calledUrl)).not.toContain("secret-token");
    expect((opts as RequestInit | undefined)?.headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("maps a transport failure to 502 bad_gateway", async () => {
    const { verifySocialToken, SocialAuthError } = await loadLib();

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const err = await verifySocialToken("facebook", "tok").catch((e) => e);
    expect(err).toBeInstanceOf(SocialAuthError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("bad_gateway");
  });
});
