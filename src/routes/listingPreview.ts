import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingsTable, listingImagesTable } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { isUuid } from "../lib/barter-listing.js";
import { p } from "../lib/route-helpers.js";

const router = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function storeUrlForUserAgent(ua: string): string | null {
  const lower = ua.toLowerCase();
  if (/iphone|ipad|ipod/.test(lower)) {
    return env.IOS_APP_STORE_URL ?? null;
  }
  if (/android/.test(lower)) {
    return env.ANDROID_PLAY_STORE_URL ?? null;
  }
  return null;
}

function isLinkPreviewBot(ua: string): boolean {
  return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|whatsapp|telegram|discord|linkedin|preview/i.test(
    ua,
  );
}

function buildPreviewHtml(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  listingId: string;
  storeUrl: string | null;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description || "Check out this item on Barter.");
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`
    : "";
  const canonical = `https://www.bartersg.com/listings/${escapeHtml(opts.listingId)}`;
  const storeHref = opts.storeUrl ? escapeHtml(opts.storeUrl) : "#";
  const storeLabel = opts.storeUrl ? "Get the app" : "Open in Barter";
  const redirectScript = opts.storeUrl
    ? `<script>window.location.replace(${JSON.stringify(opts.storeUrl)});</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Barter</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonical}" />
  ${imageMeta}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           margin: 0; padding: 2rem; background: #0f0f12; color: #f5f5f7; text-align: center; }
    a { color: #a78bfa; }
    .card { max-width: 28rem; margin: 3rem auto; }
    img { max-width: 100%; border-radius: 12px; }
    .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.25rem;
           background: #7c3aed; color: #fff; text-decoration: none; border-radius: 999px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${description}</p>
    ${opts.imageUrl ? `<img src="${escapeHtml(opts.imageUrl)}" alt="${title}" />` : ""}
    <p><a class="btn" href="${storeHref}">${storeLabel}</a></p>
  </div>
  ${redirectScript}
</body>
</html>`;
}

// ─── GET /listings/:listingId ─────────────────────────────────────────────────
// Public HTML preview for share links / Open Graph crawlers.
// When the app is installed, the OS intercepts Universal/App Links before this.
// Human mobile browsers are redirected to the App Store / Play Store.
router.get("/:listingId", async (req, res) => {
  const listingId = p(req.params["listingId"]);
  if (!isUuid(listingId)) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><h1>Listing not found</h1>");
  }

  const listing = await db.query.listingsTable.findFirst({
    where: and(eq(listingsTable.id, listingId), ne(listingsTable.status, "deleted")),
    columns: { id: true, title: true, description: true },
  });

  if (!listing) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><h1>Listing not found</h1>");
  }

  const images = await db.query.listingImagesTable.findMany({
    where: eq(listingImagesTable.listingId, listing.id),
    orderBy: (t, { asc }) => [asc(t.position)],
    columns: { url: true },
    limit: 1,
  });
  const imageUrl = images[0]?.url ?? null;

  const ua = String(req.headers["user-agent"] ?? "");
  const storeUrl = storeUrlForUserAgent(ua);

  // Redirect humans on mobile to the store when a URL is configured;
  // leave bots and desktop on the HTML preview page for OG tags / fallback.
  if (storeUrl && !isLinkPreviewBot(ua)) {
    return res.redirect(302, storeUrl);
  }

  return res.type("html").send(
    buildPreviewHtml({
      title: listing.title,
      description: listing.description,
      imageUrl,
      listingId: listing.id,
      storeUrl,
    }),
  );
});

export default router;
