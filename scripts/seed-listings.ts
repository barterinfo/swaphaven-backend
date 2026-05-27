#!/usr/bin/env node
/**
 * Interactive CLI: log in as a user and create sample listings via the HTTP API.
 *
 * Usage:
 *   npm run seed:listings
 *   npm run seed:listings -- --base-url https://swaphaven-backend-production.up.railway.app
 *   API_BASE=http://127.0.0.1:3001 npm run seed:listings
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  generateListingFixtures,
  MAX_LISTING_FIXTURES,
  type ListingFixture,
} from "./listing-fixtures.js";

const DEFAULT_API_BASE = "http://127.0.0.1:3001";
const DEFAULT_COUNT = 10;

type CliOptions = {
  apiBase: string;
  count: number;
  help: boolean;
};

type LoginResponse = {
  accessToken?: string;
  user?: { id: string; email: string; name: string };
  error?: string;
  message?: string | Record<string, string[]>;
};

type CreateListingResponse = {
  listing?: { id?: string; title?: string };
  id?: string;
  title?: string;
  error?: string;
  message?: string;
};

function printHelp(): void {
  console.log(`SwapHaven listing seed script

Creates unique sample listings for an existing user account.

Usage:
  npm run seed:listings
  npm run seed:listings -- --base-url <url> [--count <n>]

Options:
  --base-url <url>   API origin (default: API_BASE env, then PUBLIC_API_URL, then ${DEFAULT_API_BASE})
  --count <n>        Number of listings to create (default: ${DEFAULT_COUNT}, max: ${MAX_LISTING_FIXTURES})
  --help             Show this help

Environment:
  API_BASE           Same as --base-url (local: http://127.0.0.1:3001)
  PUBLIC_API_URL     Fallback API origin
  SEED_EMAIL         Skip prompt when set with SEED_PASSWORD
  SEED_PASSWORD      Skip prompt when set with SEED_EMAIL

Examples:
  npm run seed:listings
  npm run seed:listings -- --base-url https://swaphaven-backend-production.up.railway.app
`);
}

function parseArgs(argv: string[]): CliOptions {
  let apiBase =
    process.env.API_BASE?.trim() ||
    process.env.PUBLIC_API_URL?.trim() ||
    DEFAULT_API_BASE;
  let count = DEFAULT_COUNT;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--base-url") {
      const value = argv[++i];
      if (!value) throw new Error("--base-url requires a value");
      apiBase = value;
      continue;
    }
    if (arg === "--count") {
      const value = argv[++i];
      if (!value) throw new Error("--count requires a value");
      count = Number(value);
      if (!Number.isInteger(count) || count < 1) {
        throw new Error("--count must be a positive integer");
      }
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    apiBase: apiBase.replace(/\/+$/, ""),
    count: Math.min(count, MAX_LISTING_FIXTURES),
    help,
  };
}

async function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim();
  } finally {
    rl.close();
  }
}

async function promptPassword(question: string): Promise<string> {
  stdout.write(question);
  stdin.setRawMode?.(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let value = "";

    const onData = (chunk: Buffer) => {
      const char = chunk.toString("utf8");

      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(value);
        return;
      }

      if (char === "\u0003") {
        stdin.setRawMode?.(false);
        process.exit(130);
      }

      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }

      value += char;
    };

    stdin.on("data", onData);
    stdin.once("error", reject);
  });
}

async function promptCredentials(): Promise<{ email: string; password: string }> {
  const envEmail = process.env.SEED_EMAIL?.trim();
  const envPassword = process.env.SEED_PASSWORD;
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }

  const email = await promptLine("Email: ");
  if (!email.includes("@")) {
    throw new Error("Login requires an email address (e.g. you@example.com)");
  }

  const password = await promptPassword("Password: ");
  if (!password) {
    throw new Error("Password is required");
  }

  return { email, password };
}

async function login(
  apiBase: string,
  email: string,
  password: string,
): Promise<{ accessToken: string; userName: string }> {
  const res = await fetch(`${apiBase}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const body = (await res.json()) as LoginResponse;
  if (!res.ok || !body.accessToken) {
    const message =
      typeof body.message === "string"
        ? body.message
        : body.error ?? `Login failed (${res.status})`;
    throw new Error(message);
  }

  return {
    accessToken: body.accessToken,
    userName: body.user?.name ?? email,
  };
}

function buildListingPayload(fixture: ListingFixture) {
  return {
    title: fixture.title,
    description: fixture.description,
    category: fixture.category,
    categoryId: fixture.categoryId,
    condition: fixture.condition,
    estimatedValue: fixture.estimatedValue,
    estimatedValueCents: fixture.estimatedValue * 100,
    acceptCashTopUps: fixture.acceptCashTopUps,
    isSwipeOnly: fixture.isSwipeOnly,
    wantedCategoryIds: fixture.wantedCategoryIds,
    wantedCategories: fixture.wantedCategories,
    wantedFreeText: fixture.wantedFreeText,
    details: fixture.details,
    location: fixture.location,
    images: [`https://picsum.photos/seed/${fixture.imageSeed}/800/600`],
  };
}

async function createListing(
  apiBase: string,
  accessToken: string,
  payload: ReturnType<typeof buildListingPayload>,
): Promise<{ id: string; title: string }> {
  const res = await fetch(`${apiBase}/api/listings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await res.json()) as CreateListingResponse;
  if (!res.ok) {
    const message = body.error ?? body.message ?? `Create failed (${res.status})`;
    throw new Error(`${payload.title}: ${message}`);
  }

  const id = body.listing?.id ?? body.id;
  const title = body.listing?.title ?? body.title ?? payload.title;
  if (!id) throw new Error(`${payload.title}: missing listing id in response`);

  return { id, title };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  console.log(`API: ${options.apiBase}`);
  console.log(`Creating ${options.count} listing(s)...\n`);

  const { email, password } = await promptCredentials();
  const { accessToken, userName } = await login(options.apiBase, email, password);
  console.log(`Logged in as ${userName} (${email})\n`);

  const fixtures = generateListingFixtures(options.count);
  const created: { id: string; title: string }[] = [];

  for (const [index, fixture] of fixtures.entries()) {
    const payload = buildListingPayload(fixture);
    process.stdout.write(`[${index + 1}/${fixtures.length}] ${payload.title} ... `);
    const listing = await createListing(options.apiBase, accessToken, payload);
    created.push(listing);
    console.log(`ok (${listing.id})`);
  }

  console.log(`\nDone. Created ${created.length} listing(s) for ${email}.`);
}

main().catch((err: unknown) => {
  console.error("\nSeed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
