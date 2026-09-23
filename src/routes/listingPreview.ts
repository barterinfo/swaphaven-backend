import { Router } from "express";
import { and, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingsTable, listingImagesTable } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { isUuid } from "../lib/barter-listing.js";
import { p } from "../lib/route-helpers.js";
import {
  SHARE_PREVIEW_CSP,
  androidAppIntentUrl,
  escapeHtml,
  isAndroidUserAgent,
  isLinkPreviewBot,
  storeUrlForUserAgent,
} from "../lib/share-preview.js";

const router = Router();

function buildPreviewHtml(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  listingId: string;
  storeUrl: string | null;
  openAppUrl: string | null;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description || "Check out this item on Barter.");
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`
    : "";
  const canonical = `https://www.bartersg.com/listings/${escapeHtml(opts.listingId)}`;
  const autoTarget = opts.openAppUrl ?? null;
  const autoOpen = autoTarget
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(autoTarget)}" />
<script>window.location.replace(${JSON.stringify(autoTarget)});</script>`
    : "";

  let actions = "";
  if (opts.openAppUrl) {
    actions = `<p><a class="btn" href="${escapeHtml(opts.openAppUrl)}">Open in Barter</a></p>`;
    if (opts.storeUrl) {
      actions += `<p><a href="${escapeHtml(opts.storeUrl)}">Get the app</a></p>`;
    }
  } else if (opts.storeUrl) {
    actions = `<p><a class="btn" href="${escapeHtml(opts.storeUrl)}">Get the app</a></p>`;
  } else {
    const links: string[] = [];
    if (opts.iosStoreUrl) {
      links.push(
        `<a class="btn" href="${escapeHtml(opts.iosStoreUrl)}" rel="noopener noreferrer">App Store</a>`,
      );
    }
    if (opts.androidStoreUrl) {
      links.push(
        `<a class="btn btn--play" href="${escapeHtml(opts.androidStoreUrl)}" rel="noopener noreferrer">Google Play</a>`,
      );
    }
    if (links.length) {
      actions = `<p class="stores">${links.join("")}</p>
<p class="hint">Get Barter, then open this item from the app.</p>`;
    } else {
      actions = `<p><a class="btn" href="#">Open in Barter</a></p>`;
    }
  }

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
  ${autoOpen}
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           margin: 0; padding: 2rem; background: #0f0f12; color: #f5f5f7; text-align: center; }
    a { color: #a78bfa; }
    .card { max-width: 28rem; margin: 3rem auto; }
    img { max-width: 100%; border-radius: 12px; }
    .btn { display: inline-block; margin: 0.5rem 0.35rem 0; padding: 0.75rem 1.25rem;
           background: #7c3aed; color: #fff; text-decoration: none; border-radius: 999px; }
    .btn--play { background: #1e3a8a; }
    .stores { display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-top: 1.25rem; }
    .hint { color: #94a3b8; font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${description}</p>
    ${opts.imageUrl ? `<img src="${escapeHtml(opts.imageUrl)}" alt="${title}" />` : ""}
    ${actions}
  </div>
</body>
</html>`;
}

// ─── GET /listings/:listingId ─────────────────────────────────────────────────
// Public HTML preview for share links / Open Graph crawlers.
// When App Links verify, the OS intercepts before this. Android browsers that
// reach us try an explicit intent:// handoff (installed app) before Play Store.
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
  const android = isAndroidUserAgent(ua);
  const openAppUrl = android && !isLinkPreviewBot(ua)
    ? androidAppIntentUrl(`/listings/${listing.id}`, storeUrl)
    : null;
  const iosStoreUrl = env.IOS_APP_STORE_URL ?? null;
  const androidStoreUrl = env.ANDROID_PLAY_STORE_URL ?? null;

  // iOS still goes to the App Store when Universal Links did not intercept.
  // Android must not 302 to Play — that skips the installed app entirely.
  if (storeUrl && !android && !isLinkPreviewBot(ua)) {
    return res.redirect(302, storeUrl);
  }

  res.setHeader("Content-Security-Policy", SHARE_PREVIEW_CSP);
  return res.type("html").send(
    buildPreviewHtml({
      title: listing.title,
      description: listing.description,
      imageUrl,
      listingId: listing.id,
      storeUrl,
      openAppUrl,
      iosStoreUrl,
      androidStoreUrl,
    }),
  );
});

export default router;
