import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { app } from "./helpers/app.js";
import { registerUser, uid } from "./helpers/fixtures.js";
import { testDb } from "./helpers/db.js";
import { usersTable } from "../src/db/schema/index.js";

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
  it("returns generic message for registered email", async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
  });

  it("returns same generic message for unknown email (prevents enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: `ghost-${uid()}@nowhere.com` });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain("If an account exists");
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
  it("resets password with a valid token and allows re-login", async () => {
    const { email } = await registerUser();
    const rawToken  = "test-reset-token-abcdef1234567890";
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    // Manually inject a reset token (simulates what forgot-password would send via email)
    await testDb
      .update(usersTable)
      .set({ passwordResetTokenHash: tokenHash, passwordResetExpires: new Date(Date.now() + 3_600_000) })
      .where(eq(usersTable.email, email));

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, token: rawToken, newPassword: "NewSecurePass99!" });

    expect(res.status).toBe(200);

    // Should be able to log in with new password
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email, password: "NewSecurePass99!" });
    expect(loginRes.status).toBe(200);
  });

  it("rejects an expired or wrong token", async () => {
    const { email } = await registerUser();
    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({ email, token: "wrong-token", newPassword: "NewPass1234!" });

    expect(res.status).toBe(400);
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

  it("rejects invalid platform", async () => {
    const { accessToken } = await registerUser();
    const res = await request(app)
      .post("/api/auth/device-token")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ token: "abc", platform: "windows" });
    expect(res.status).toBe(400);
  });
});
