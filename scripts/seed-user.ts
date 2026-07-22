#!/usr/bin/env node
/**
 * Interactive CLI: register a new SwapHaven user via POST /api/auth/register.
 *
 * Usage:
 *   npm run seed:user
 *   npm run seed:user -- --random
 *   npm run seed:user -- --base-url https://swaphaven-backend-production.up.railway.app
 */
import crypto from "node:crypto";
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const DEFAULT_API_BASE = "http://127.0.0.1:3001";
const DEFAULT_PASSWORD = "password123";

type CliOptions = {
  apiBase: string;
  help: boolean;
  random: boolean;
};

type RegisterResponse = {
  accessToken?: string;
  refreshToken?: string;
  user?: { id: string; email: string; name: string };
  error?: string;
  message?: string | Record<string, string[]>;
};

type StartRegisterResponse = {
  message?: string;
  error?: string;
};

function printHelp(): void {
  console.log(`SwapHaven user signup script

Registers a new account via POST /api/auth/register + /register/verify (email OTP).

Usage:
  npm run seed:user
  npm run seed:user -- --random
  npm run seed:user -- --base-url <url>

Options:
  --base-url <url>   API origin (default: API_BASE env, then PUBLIC_API_URL, then ${DEFAULT_API_BASE})
  --random           Create a random test user (no prompts for name/email)
  --help             Show this help

Environment:
  API_BASE           Same as --base-url (local: http://127.0.0.1:3001)
  PUBLIC_API_URL     Fallback API origin
  SEED_NAME          Skip prompts when set with SEED_EMAIL
  SEED_EMAIL         Account email (or username@example.com)
  SEED_PASSWORD      Override default password (${DEFAULT_PASSWORD})
  SEED_OTP           Skip OTP prompt (use code from email / server logs)

Examples:
  npm run seed:user
  npm run seed:user -- --random
  SEED_OTP=123456 npm run seed:user -- --random
  npm run seed:user -- --base-url https://swaphaven-backend-production.up.railway.app
`);
}

function parseArgs(argv: string[]): CliOptions {
  let apiBase =
    process.env.API_BASE?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    DEFAULT_API_BASE;
  let help = false;
  let random = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--random") {
      random = true;
      continue;
    }
    if (arg === "--base-url") {
      const value = argv[++i];
      if (!value) throw new Error("--base-url requires a value");
      apiBase = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apiBase: apiBase.replace(/\/+$/, ""),
    help,
    random,
  };
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

function normalizeEmail(usernameOrEmail: string): string {
  const value = usernameOrEmail.trim().toLowerCase();
  if (!value) throw new Error("Username is required");
  if (value.includes("@")) return value;
  return `${value}@example.com`;
}

function resolvePassword(): string {
  return process.env.SEED_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

function randomTestUser(): { name: string; email: string; password: string } {
  const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
  return {
    name: `Test User ${suffix}`,
    email: `test-${suffix}@example.com`,
    password: resolvePassword(),
  };
}

async function promptSignupDetails(): Promise<{ name: string; email: string; password: string }> {
  const envName = process.env.SEED_NAME?.trim();
  const envEmail = process.env.SEED_EMAIL?.trim();
  if (envName && envEmail) {
    return {
      name: envName,
      email: normalizeEmail(envEmail),
      password: resolvePassword(),
    };
  }

  const name = await promptLine("Name: ");
  if (!name) throw new Error("Name is required");

  const username = await promptLine("Username (email): ");
  const email = normalizeEmail(username);

  return { name, email, password: resolvePassword() };
}

function formatErrorMessage(
  body: RegisterResponse | StartRegisterResponse,
  status: number,
): string {
  if (typeof body.message === "string") return body.message;
  if (body.message && typeof body.message === "object") {
    const parts = Object.entries(body.message).flatMap(([field, errors]) =>
      (errors ?? []).map((e) => `${field}: ${e}`),
    );
    if (parts.length) return parts.join("; ");
  }
  return body.error ?? `Registration failed (${status})`;
}

async function startRegistration(
  apiBase: string,
  details: { name: string; email: string; password: string },
): Promise<void> {
  const res = await fetch(`${apiBase}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });

  const body = (await res.json()) as StartRegisterResponse;
  if (!res.ok) {
    throw new Error(formatErrorMessage(body, res.status));
  }
}

async function verifyRegistration(
  apiBase: string,
  email: string,
  token: string,
): Promise<RegisterResponse> {
  const res = await fetch(`${apiBase}/api/auth/register/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, token }),
  });

  const body = (await res.json()) as RegisterResponse;
  if (!res.ok || !body.accessToken || !body.user) {
    throw new Error(formatErrorMessage(body, res.status));
  }

  return body;
}

async function resolveOtp(): Promise<string> {
  const fromEnv = process.env.SEED_OTP?.trim();
  if (fromEnv) return fromEnv;
  const otp = await promptLine("Enter 6-digit OTP from email (or server logs): ");
  if (!otp) throw new Error("OTP is required");
  return otp;
}

async function registerUser(
  apiBase: string,
  details: { name: string; email: string; password: string },
): Promise<RegisterResponse> {
  await startRegistration(apiBase, details);
  console.log("Verification code sent. Check email (or non-prod server logs).\n");
  const otp = await resolveOtp();
  return verifyRegistration(apiBase, details.email, otp);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(`API: ${options.apiBase}\n`);

  const details = options.random ? randomTestUser() : await promptSignupDetails();

  if (options.random) {
    console.log("Creating random test user...");
    console.log(`  Name:     ${details.name}`);
    console.log(`  Email:    ${details.email}`);
    console.log(`  Password: ${details.password}\n`);
  } else if (!process.env.SEED_NAME || !process.env.SEED_EMAIL) {
    console.log(`Using password: ${details.password}\n`);
  }

  const result = await registerUser(options.apiBase, details);
  const user = result.user!;

  console.log("Account created successfully.\n");
  console.log(`  User ID:  ${user.id}`);
  console.log(`  Name:     ${user.name}`);
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${details.password}`);
  console.log(`  Token:    ${result.accessToken!.slice(0, 24)}...`);
  console.log("\nYou can log in with this account in the app, or run:");
  console.log(
    `  SEED_EMAIL=${user.email} SEED_PASSWORD='${details.password}' npm run seed:listings`,
  );
}

main().catch((err: unknown) => {
  console.error("\nSignup failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
