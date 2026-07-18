import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createHash } from "crypto";
import { DatabaseError } from "pg";
import { eq, sql } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { db } from "../src/db/client.js";
import { usersTable, deviceTokensTable } from "../src/db/schema/index.js";
import { SocialAuthError, verifySocialToken } from "../src/lib/social-auth.js";
import { sendPasswordResetOtp } from "../src/lib/mailer.js";

// Mock the provider verification so tests never hit Google / Facebook.
vi.mock("../src/lib/social-auth.js", async () => {
  const actual = await vi.importActual<typeof import("../src/lib/social-auth.js")>(
    "../src/lib/social-auth.js",
  );
  return { ...actual, verifySocialToken: vi.fn() };
});

vi.mock("../src/lib/mailer.js", () => ({
  sendPasswordResetOtp: vi.fn().mockResolvedValue(undefined),
  MailerError: class MailerError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "MailerError";
    }
  },
}));

const mockVerify = vi.mocked(verifySocialToken);
const mockSendOtp = vi.mocked(sendPasswordResetOtp);

// ─── POST /api/auth/register ──────────────────────────────────────────────────
describe("POST /api/auth/register", () => {
  it("creates a user and returns tokens", async () => {
    const email = `reg-${uid()}@test.com`;
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "SecurePass1!", name: "Alice" });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.id).toBeTruthy();
  });

  it("normalises email to lowercase", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `UPPER-${uid()}@Test.COM`, password: "SecurePass1!", name: "Alice" });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toMatch(/^upper-/);
  });

  it("rejects duplicate email with 409", async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email, password: "SecurePass1!", name: "Clone" });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("conflict");
  });

  it("validates missing required fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "notvalid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation");
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: `short-${uid()}@test.com`, password: "abc", name: "Bob" });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
describe("POST /api/auth/login", () => {
  it("returns tokens for valid credentials", async () => {
    const { email, password } = await registerUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
  });

  it("rejects wrong password with 401", async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "WrongPassword!" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("rejects unknown email with 401 (no enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: `nobody-${uid()}@ghost.com`, password: "irrelevant123" });

    expect(res.status).toBe(401);
    // Must be the same message regardless of whether the user exists
    expect(res.body.message).toBe("Invalid email or password");
  });
});

// ─── POST /api/auth/social ────────────────────────────────────────────────────
describe("POST /api/auth/social", () => {
  beforeEach(() => mockVerify.mockReset());

  it("creates a new account and returns tokens", async () => {
    const email = `social-${uid()}@test.com`;
    mockVerify.mockResolvedValueOnce({ email, name: "Social Sam" });

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "google-id-token" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.name).toBe("Social Sam");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(mockVerify).toHaveBeenCalledWith("google", "google-id-token");
  });

  it("logs in an existing account without creating a duplicate", async () => {
    const email = `social-dup-${uid()}@test.com`;
    mockVerify.mockResolvedValue({ email, name: "Repeat User" });

    const first = await request(app)
      .post("/api/auth/social")
      .send({ provider: "facebook", idToken: "fb-token" });
    const second = await request(app)
      .post("/api/auth/social")
      .send({ provider: "facebook", idToken: "fb-token" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);

    const [{ count }] = await testDb
      .select({ count: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(eq(usersTable.email, email));
    expect(count).toBe(1);
  });

  it("logs into an existing password account when social email matches", async () => {
    const email = `link-${uid()}@test.com`;
    await registerUser({ email });
    mockVerify.mockResolvedValueOnce({ email, name: "Linked" });

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "tok" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("recovers from concurrent sign-up when insert hits unique email constraint", async () => {
    const email = `race-${uid()}@test.com`;
    const { user: existing } = await registerUser({ email });
    mockVerify.mockResolvedValueOnce({ email, name: "Race User" });

    const findFirstSpy = vi
      .spyOn(db.query.usersTable, "findFirst")
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(existing);

    const insertSpy = vi.spyOn(db, "insert").mockImplementation(() => {
      throw Object.assign(new DatabaseError("duplicate key", 0, "error"), { code: "23505" });
    });

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "tok" });

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(existing.id);
    expect(res.body.user.email).toBe(email);
    expect(insertSpy).toHaveBeenCalled();
    expect(findFirstSpy).toHaveBeenCalledTimes(2);

    findFirstSpy.mockRestore();
    insertSpy.mockRestore();
  });

  it("normalises the provider email to lowercase", async () => {
    const email = `SOCIAL-UP-${uid()}@Test.COM`;
    mockVerify.mockResolvedValueOnce({ email, name: "Upper" });

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "tok" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email.toLowerCase());
  });

  it("rejects an unsupported provider with 400", async () => {
    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "twitter", idToken: "tok" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation");
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("rejects a missing idToken with 400", async () => {
    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("validation");
  });

  it("maps an invalid social token to 401", async () => {
    mockVerify.mockRejectedValueOnce(new SocialAuthError("Invalid Google token", 401, "unauthorized"));

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "bad-token" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("unauthorized");
  });

  it("maps an unconfigured provider to 503", async () => {
    mockVerify.mockRejectedValueOnce(
      new SocialAuthError("Google sign-in is not configured", 503, "unavailable"),
    );

    const res = await request(app)
      .post("/api/auth/social")
      .send({ provider: "google", idToken: "tok" });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("unavailable");
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────
describe("POST /api/auth/refresh", () => {
  it("issues new tokens from a valid refresh token", async () => {
    const { refreshToken } = await registerUser();
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("rejects missing refresh token with 400", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});
    expect(res.status).toBe(400);
  });

  it("rejects tampered refresh token with 401", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "not.a.token" });
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
describe("POST /api/auth/logout", () => {
  it("returns 204 for authenticated user", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
  });

  it("returns 401 without token", async () => {
    const res = await request(app).post("/api/auth/logout");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
describe("GET /api/auth/me", () => {
  it("returns current user data", async () => {
    const { accessToken, email } = await registerUser();
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("returns 401 without token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────
describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    mockSendOtp.mockReset();
    mockSendOtp.mockResolvedValue(undefined);
  });

  it("returns generic message and emails OTP for registered email", async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
    expect(mockSendOtp).toHaveBeenCalledOnce();
    expect(mockSendOtp.mock.calls[0]![0]).toMatchObject({
      to: email,
      expiresMinutes: 10,
    });
    expect(mockSendOtp.mock.calls[0]![0].otp).toMatch(/^\d{6}$/);
  });

  it("returns same generic message for unknown email without sending (prevents enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `ghost-${uid()}@nowhere.com` });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
    expect(mockSendOtp).not.toHaveBeenCalled();
  });

  it("returns 503 and clears OTP when mailer fails", async () => {
    const { email } = await registerUser();
    mockSendOtp.mockRejectedValueOnce(new Error("resend down"));

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email });

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("service_unavailable");

    const row = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });
    expect(row?.passwordResetTokenHash).toBeNull();
    expect(row?.passwordResetExpires).toBeNull();
  });

  it("rejects invalid email", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────
describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    mockSendOtp.mockReset();
    mockSendOtp.mockResolvedValue(undefined);
  });

  it("resets password with OTP from forgot-password and allows re-login", async () => {
    const { email } = await registerUser();
    let otp = "";
    mockSendOtp.mockImplementationOnce(async (params) => {
      otp = params.otp;
    });

    await request(app).post("/api/auth/forgot-password").send({ email });
    expect(otp).toMatch(/^\d{6}$/);

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, token: otp, newPassword: "NewSecurePass99!" });

    expect(res.status).toBe(200);

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NewSecurePass99!" });
    expect(loginRes.status).toBe(200);
  });

  it("rejects a wrong OTP", async () => {
    const { email } = await registerUser();
    const otp = "123456";
    const tokenHash = createHash("sha256").update(otp).digest("hex");

    await testDb
      .update(usersTable)
      .set({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: new Date(Date.now() + 600_000),
        passwordResetAttempts: 0,
      })
      .where(eq(usersTable.email, email));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, token: "000000", newPassword: "NewPass1234!" });

    expect(res.status).toBe(400);

    const row = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });
    expect(row?.passwordResetAttempts).toBe(1);
  });

  it("locks out after 5 failed OTP attempts", async () => {
    const { email } = await registerUser();
    const otp = "654321";
    const tokenHash = createHash("sha256").update(otp).digest("hex");

    await testDb
      .update(usersTable)
      .set({
        passwordResetTokenHash: tokenHash,
        passwordResetExpires: new Date(Date.now() + 600_000),
        passwordResetAttempts: 0,
      })
      .where(eq(usersTable.email, email));

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/reset-password")
        .send({ email, token: "000000", newPassword: "NewPass1234!" });
      expect(res.status).toBe(400);
    }

    const afterLock = await testDb.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });
    expect(afterLock?.passwordResetTokenHash).toBeNull();

    const withCorrect = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, token: otp, newPassword: "NewPass1234!" });
    expect(withCorrect.status).toBe(400);
  });
});

// ─── POST /api/auth/device-token ─────────────────────────────────────────────
describe("POST /api/auth/device-token", () => {
  it("registers a push token", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "fcm-token-xyz", platform: "android" });

    expect(res.status).toBe(204);
  });

  it("is idempotent on duplicate token", async () => {
    const { accessToken } = await registerUser();
    const payload = { token: "fcm-dedup-token", platform: "ios" };

    await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    const res = await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(payload);

    expect(res.status).toBe(204);
  });

  it("reassigns token to new user when another account registers the same device token", async () => {
    const userA = await registerUser();
    const userB = await registerUser();
    const token = "shared-fcm-token-xyz";

    await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ token, platform: "android" });

    const res = await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ token, platform: "ios" });

    expect(res.status).toBe(204);

    const rows = await testDb
      .select()
      .from(deviceTokensTable)
      .where(eq(deviceTokensTable.token, token));

    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(userB.user.id);
    expect(rows[0]!.platform).toBe("ios");
  });

  it("rejects invalid platform", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "abc", platform: "windows" });
    expect(res.status).toBe(400);
  });
});
