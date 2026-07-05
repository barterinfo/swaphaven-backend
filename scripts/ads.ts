#!/usr/bin/env node
/**
 * Sponsored-ads interactive CLI.
 *
 * Walks you through creating an ad — sponsor name, tagline, CTA, colour,
 * link, and a local image path that's uploaded to S3 for you — then writes
 * it to the database. Also exposes list / pause / activate / delete from
 * the same menu so you don't need a second tool for routine ad ops.
 *
 * Runs against whatever DATABASE_URL is in your environment (local by
 * default; export a Railway URL to hit production). Image uploads require
 * AWS_REGION, S3_MEDIA_BUCKET, and AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.
 *
 * Usage:
 *   npm run ads
 */

import "dotenv/config";

import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { desc, eq } from "drizzle-orm";

import { db, pool } from "../src/db/client.js";
import { sponsoredAdsTable, type SponsoredAd } from "../src/db/schema/sponsored_ads.js";
import { env } from "../src/config/env.js";
import { publicUrlForKey } from "../src/lib/media.js";
import {
  IMAGE_CONTENT_TYPES,
  explainS3UploadError,
  looksLikeDirectImageUrl,
  normalizeUserPath,
} from "./lib/ads-image-utils.js";

// ─── Prompt helpers ──────────────────────────────────────────────────────────
// One long-lived readline is cheaper than opening/closing per prompt and
// keeps Ctrl-C behaviour consistent.

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(question: string, opts: { defaultValue?: string; required?: boolean } = {}): Promise<string> {
  const suffix = opts.defaultValue ? ` [${opts.defaultValue}]` : "";
  for (;;) {
    const raw = (await rl.question(`${question}${suffix}: `)).trim();
    const value = raw.length === 0 ? (opts.defaultValue ?? "") : raw;
    if (value.length > 0 || !opts.required) return value;
    console.log("  (required)");
  }
}

async function askInt(question: string, defaultValue: number): Promise<number> {
  for (;;) {
    const raw = (await ask(question, { defaultValue: String(defaultValue) })).trim();
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
    console.log("  Please enter a whole number.");
  }
}

async function askDate(question: string): Promise<Date | null> {
  const raw = (await ask(`${question} (blank = no bound)`)).trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    console.log("  Unrecognised date — leaving unset.");
    return null;
  }
  return d;
}

async function askYesNo(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const raw = (await rl.question(`${question} [${hint}]: `)).trim().toLowerCase();
  if (!raw) return defaultYes;
  return raw === "y" || raw === "yes";
}

// ─── S3 upload ───────────────────────────────────────────────────────────────

let cachedS3: S3Client | null = null;
function s3(): S3Client {
  if (!env.AWS_REGION || !env.S3_MEDIA_BUCKET) {
    throw new Error(
      "S3 is not configured. Set AWS_REGION, S3_MEDIA_BUCKET, and (optionally) AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY.",
    );
  }
  if (cachedS3) return cachedS3;
  const config: ConstructorParameters<typeof S3Client>[0] = { region: env.AWS_REGION };
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    };
  }
  cachedS3 = new S3Client(config);
  return cachedS3;
}

/**
 * Uploads a local image file to S3 under `ads/<uuid>.<ext>` and returns the
 * public URL. Throws if the path is missing or the extension is unsupported.
 */
async function uploadLocalImage(rawPath: string): Promise<string> {
  const path = resolve(normalizeUserPath(rawPath));
  const ext = extname(path).toLowerCase();
  const contentType = IMAGE_CONTENT_TYPES[ext];
  if (!contentType) {
    throw new Error(
      `Unsupported extension "${ext || "(none)"}". Allowed: ${Object.keys(IMAGE_CONTENT_TYPES).join(", ")}`,
    );
  }
  try {
    await stat(path);
  } catch {
    throw new Error(`File not found: ${path}`);
  }

  const body = await readFile(path);
  const key = `ads/${randomUUID()}${ext}`;
  console.log(`  Uploading ${basename(path)} → s3://${env.S3_MEDIA_BUCKET}/${key} ...`);
  try {
    await s3().send(new PutObjectCommand({
      Bucket:      env.S3_MEDIA_BUCKET!,
      Key:         key,
      Body:        body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }));
  } catch (err) {
    throw new Error(explainS3UploadError(err, env.S3_MEDIA_BUCKET, env.AWS_REGION));
  }
  const url = publicUrlForKey(key);
  console.log(`  Done: ${url}`);
  return url;
}

async function askImageSourceChoice(): Promise<"none" | "local" | "remote"> {
  console.log("\n  Background image — choose one:");
  console.log("    1) None          dark gradient card (no photo)");
  console.log("    2) Local file    upload from your machine → S3");
  console.log("                     e.g. ~/Downloads/banner.jpg");
  console.log("                          ./assets/promo.png");
  console.log("    3) Remote URL    use an already-hosted direct image link");
  console.log("                     e.g. https://cdn.example.com/ads/banner.jpg");
  console.log("                          https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600");
  console.log("                     ✗ not a web page — must point at .jpg / .png / .webp");

  for (;;) {
    const raw = (await ask("Your choice [1/2/3]", { defaultValue: "1" })).trim();
    if (raw === "1" || /^none$/i.test(raw)) return "none";
    if (raw === "2" || /^local$/i.test(raw)) return "local";
    if (raw === "3" || /^remote$/i.test(raw)) return "remote";
    console.log("  Please enter 1, 2, or 3 (or none / local / remote).");
  }
}

async function promptLocalImagePath(): Promise<string> {
  console.log("\n  Local upload — file is sent to S3 and the public URL is saved on the ad.");
  console.log("  Examples (quotes optional — paste path only is fine):");
  console.log("    ~/Downloads/sponsor-banner.jpg");
  console.log("    ./assets/greenloop-promo.png");
  console.log("    /Users/you/Pictures/ad.webp");

  for (;;) {
    const raw = (await ask("Path to image file on your machine", { required: true })).trim();
    try {
      return await uploadLocalImage(raw);
    } catch (err) {
      console.log(`  ${err instanceof Error ? err.message : err}`);
    }
  }
}

async function promptRemoteImageUrl(): Promise<string> {
  console.log("\n  Remote URL — paste a direct link to an image file (not a web page).");
  console.log("  Good examples:");
  console.log("    https://cdn.yoursite.com/ads/holiday-banner.jpg");
  console.log("    https://images.unsplash.com/photo-1567016432779-094069958ea5?w=600&q=80");
  console.log("  Bad examples (these will NOT work as card backgrounds):");
  console.log("    https://www.biography.com/athletes/…   ← article page, not an image");
  console.log("    https://example.com/promo              ← no .jpg / .png in the URL");

  for (;;) {
    const raw = (await ask("Direct image URL (https://…)", { required: true })).trim();
    const url = normalizeUserPath(raw);
    if (!/^https?:\/\//i.test(url)) {
      console.log("  URL must start with http:// or https://");
      continue;
    }
    if (!looksLikeDirectImageUrl(url)) {
      console.log(
        "  That does not look like a direct image link.\n" +
        "  The URL should end with .jpg, .jpeg, .png, .webp, .heic, or .heif,\n" +
        "  or choose option 2 to upload a file from your machine instead.",
      );
      continue;
    }
    console.log(`  Using remote image: ${url}`);
    return url;
  }
}

/**
 * Interactive background-image picker.
 * Asks local vs remote vs none, with examples, then returns the URL to store
 * (empty string = dark gradient).
 */
async function askForImageUrl(): Promise<string> {
  const source = await askImageSourceChoice();
  switch (source) {
    case "none":   return "";
    case "local":  return promptLocalImagePath();
    case "remote": return promptRemoteImageUrl();
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatAd(ad: SponsoredAd): string {
  const status = ad.active ? "active" : "paused";
  const window = [
    ad.startsAt ? `starts ${ad.startsAt.toISOString()}` : null,
    ad.endsAt   ? `ends ${ad.endsAt.toISOString()}`     : null,
  ].filter(Boolean).join("  ");
  return [
    `  id:       ${ad.id}`,
    `  sponsor:  ${ad.sponsorName}`,
    `  tagline:  ${ad.tagline}`,
    `  cta:      ${ad.ctaLabel}   ${ad.ctaColor}   ${ad.ctaUrl ?? "(no link)"}`,
    `  image:    ${ad.backgroundImageUrl || "(dark gradient)"}`,
    `  status:   ${status}   weight ${ad.weight}   impressions ${ad.impressionCount}   clicks ${ad.clickCount}${window ? `   ${window}` : ""}`,
  ].join("\n");
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function createFlow(): Promise<void> {
  console.log("\n── New sponsored ad ──");
  const sponsorName = await ask("Sponsor name",                     { required: true });
  const tagline     = await ask("Tagline (one line)",               { required: true });
  const ctaLabel    = await ask("CTA button label",                 { required: true, defaultValue: "Learn more" });
  const ctaColor    = await ask("CTA button colour (hex #RRGGBB)",  { required: true, defaultValue: "#F59E0B" });
  const ctaUrlRaw   = await ask("CTA link (https:// or app deep link, blank for no-op)");
  const backgroundImageUrl = await askForImageUrl();
  const weight      = await askInt("Rotation weight (higher = shown more often)", 1);
  const startsAt    = await askDate("Campaign start");
  const endsAt      = await askDate("Campaign end");

  console.log("\nReview:");
  console.log(formatAd({
    id: "(new)",
    sponsorName, tagline, ctaLabel, ctaColor,
    ctaUrl: ctaUrlRaw || null,
    backgroundImageUrl,
    active: true, weight,
    startsAt, endsAt,
    createdAt: new Date(), updatedAt: new Date(),
  } as SponsoredAd));

  if (!(await askYesNo("\nCreate this ad?", true))) {
    console.log("Aborted.");
    return;
  }

  const [row] = await db
    .insert(sponsoredAdsTable)
    .values({
      sponsorName, tagline, ctaLabel, ctaColor,
      ctaUrl: ctaUrlRaw || null,
      backgroundImageUrl,
      weight,
      startsAt, endsAt,
    })
    .returning();

  console.log("\nCreated:");
  console.log(formatAd(row!));
}

async function listFlow(): Promise<void> {
  const activeOnly = await askYesNo("Show only active ads?", false);
  const rows = await db
    .select()
    .from(sponsoredAdsTable)
    .where(activeOnly ? eq(sponsoredAdsTable.active, true) : undefined)
    .orderBy(desc(sponsoredAdsTable.createdAt));

  if (rows.length === 0) {
    console.log(activeOnly ? "\nNo active ads." : "\nNo ads.");
    return;
  }
  console.log(`\n${rows.length} ad(s):\n`);
  for (const ad of rows) {
    console.log(formatAd(ad));
    console.log();
  }
}

async function setActiveFlow(active: boolean): Promise<void> {
  const id = await ask(`Ad id to ${active ? "activate" : "pause"}`, { required: true });
  const [row] = await db
    .update(sponsoredAdsTable)
    .set({ active, updatedAt: new Date() })
    .where(eq(sponsoredAdsTable.id, id))
    .returning();
  if (!row) {
    console.log(`No ad found with id ${id}.`);
    return;
  }
  console.log(`\n${active ? "Activated" : "Paused"}:`);
  console.log(formatAd(row));
}

async function updateFlow(): Promise<void> {
  const id = await ask("Ad id to update", { required: true });
  const existing = await db.query.sponsoredAdsTable.findFirst({
    where: eq(sponsoredAdsTable.id, id),
  });
  if (!existing) {
    console.log(`No ad found with id ${id}.`);
    return;
  }

  console.log("\nCurrent ad (press Enter on any field to keep the current value):");
  console.log(formatAd(existing));

  const sponsorName = await ask("Sponsor name", { defaultValue: existing.sponsorName });
  const tagline     = await ask("Tagline",      { defaultValue: existing.tagline });
  const ctaLabel    = await ask("CTA button label", { defaultValue: existing.ctaLabel });
  const ctaColor    = await ask("CTA button colour (hex #RRGGBB)", { defaultValue: existing.ctaColor });
  const ctaUrlRaw   = await ask("CTA link (blank to keep, 'null' to clear)", {
    defaultValue: existing.ctaUrl ?? "",
  });

  console.log("\nBackground image");
  console.log(`  Current: ${existing.backgroundImageUrl || "(dark gradient)"}`);
  const replaceImage = await askYesNo("Change background image?", false);
  let backgroundImageUrl = existing.backgroundImageUrl;
  if (replaceImage) {
    backgroundImageUrl = await askForImageUrl();
  }

  const weightRaw = await ask("Rotation weight", { defaultValue: String(existing.weight) });
  const weight = Number.parseInt(weightRaw, 10);
  if (!Number.isFinite(weight)) {
    console.log("Invalid weight — keeping current value.");
  }

  const patch = {
    sponsorName,
    tagline,
    ctaLabel,
    ctaColor,
    ctaUrl: ctaUrlRaw === "null" ? null : (ctaUrlRaw || existing.ctaUrl),
    backgroundImageUrl,
    weight: Number.isFinite(weight) ? weight : existing.weight,
    updatedAt: new Date(),
  };

  console.log("\nUpdated preview:");
  console.log(formatAd({ ...existing, ...patch }));

  if (!(await askYesNo("\nSave changes?", true))) {
    console.log("Aborted.");
    return;
  }

  const [row] = await db
    .update(sponsoredAdsTable)
    .set(patch)
    .where(eq(sponsoredAdsTable.id, id))
    .returning();

  console.log("\nSaved:");
  console.log(formatAd(row!));
}

async function deleteFlow(): Promise<void> {
  const id = await ask("Ad id to delete", { required: true });
  const existing = await db.query.sponsoredAdsTable.findFirst({
    where: eq(sponsoredAdsTable.id, id),
  });
  if (!existing) {
    console.log(`No ad found with id ${id}.`);
    return;
  }
  console.log("\nAbout to delete:");
  console.log(formatAd(existing));
  if (!(await askYesNo("\nReally delete this ad? This cannot be undone.", false))) {
    console.log("Aborted.");
    return;
  }
  await db.delete(sponsoredAdsTable).where(eq(sponsoredAdsTable.id, id));
  console.log(`Deleted ${id}.`);
}

// ─── Menu ────────────────────────────────────────────────────────────────────

type MenuItem = { key: string; label: string; run: () => Promise<void> };

const MENU: MenuItem[] = [
  { key: "1", label: "Create a new ad",       run: createFlow },
  { key: "2", label: "List ads",              run: listFlow },
  { key: "3", label: "Update an ad",          run: updateFlow },
  { key: "4", label: "Pause an ad",           run: () => setActiveFlow(false) },
  { key: "5", label: "Activate an ad",        run: () => setActiveFlow(true) },
  { key: "6", label: "Delete an ad",          run: deleteFlow },
  { key: "q", label: "Quit",                  run: async () => { /* handled below */ } },
];

async function menu(): Promise<void> {
  console.log("\nSponsored ads");
  console.log(`DB: ${env.DATABASE_URL.replace(/\/\/[^@]+@/, "//***@")}`);
  console.log(env.S3_MEDIA_BUCKET
    ? `S3: ${env.S3_MEDIA_BUCKET} (${env.AWS_REGION})`
    : "S3: not configured — image uploads will be skipped");
  console.log();
  for (const item of MENU) {
    console.log(`  ${item.key}) ${item.label}`);
  }
  const choice = (await rl.question("\nChoose an option: ")).trim().toLowerCase();
  const match = MENU.find((m) => m.key === choice);
  if (!match) {
    console.log("Unknown option.");
    return menu();
  }
  if (match.key === "q") return;
  try {
    await match.run();
  } catch (err) {
    console.error("\nError:", err instanceof Error ? err.message : err);
  }
  return menu();
}

// ─── Entry point ─────────────────────────────────────────────────────────────

menu()
  .catch((err: unknown) => {
    console.error("\nFatal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    rl.close();
    await pool.end().catch(() => { /* pool may already be closed */ });
  });
