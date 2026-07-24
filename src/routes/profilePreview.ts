import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { userProfilesTable } from "../db/schema/index.js";
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
  userId: string;
  storeUrl: string | null;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description || "Check out this profile on Barter.");
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`
    : "";
  const canonical = `https://www.bartersg.com/users/${escapeHtml(opts.userId)}`;
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
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonical}" />
  ${imageMeta}
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           margin: 0; padding: 2rem; background: #0f0f12; color: #f5f5f7; text-align: center; }
    a { color: #a78bfa; }
    .card { max-width: 28rem; margin: 3rem auto; }
    img { max-width: 8rem; border-radius: 999px; }
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

// ─── GET /users/:userId ───────────────────────────────────────────────────────
// Public HTML preview for profile share links / Open Graph crawlers.
router.get("/:userId", async (req, res) => {
  const userId = p(req.params["userId"]);
  if (!isUuid(userId)) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><h1>Profile not found</h1>");
  }

  const profile = await db.query.userProfilesTable.findFirst({
    where: eq(userProfilesTable.id, userId),
    columns: {
      id: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
    },
  });

  if (!profile) {
    return res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><h1>Profile not found</h1>");
  }

  const ua = String(req.headers["user-agent"] ?? "");
  const storeUrl = storeUrlForUserAgent(ua);

  if (storeUrl && !isLinkPreviewBot(ua)) {
    return res.redirect(302, storeUrl);
  }

  const title = profile.displayName?.trim() || "Barter member";
  return res.type("html").send(
    buildPreviewHtml({
      title,
      description: profile.bio?.trim() || `Check out ${title} on Barter.`,
      imageUrl: profile.avatarUrl ?? null,
      userId: profile.id,
      storeUrl,
    }),
  );
});

export default router;
