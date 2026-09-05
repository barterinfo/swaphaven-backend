import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { userProfilesTable } from "../db/schema/index.js";
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
  userId: string;
  storeUrl: string | null;
  openAppUrl: string | null;
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(opts.description || "Check out this profile on Barter.");
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`
    : "";
  const canonical = `https://www.bartersg.com/users/${escapeHtml(opts.userId)}`;
  const primaryHref = opts.openAppUrl ?? opts.storeUrl ?? "#";
  const primaryLabel = opts.openAppUrl ? "Open in Barter" : opts.storeUrl ? "Get the app" : "Open in Barter";
  const autoTarget = opts.openAppUrl ?? null;
  const autoOpen = autoTarget
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(autoTarget)}" />
<script>window.location.replace(${JSON.stringify(autoTarget)});</script>`
    : "";
  const storeLink = opts.openAppUrl && opts.storeUrl
    ? `<p><a href="${escapeHtml(opts.storeUrl)}">Get the app</a></p>`
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
  ${autoOpen}
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
    <p><a class="btn" href="${escapeHtml(primaryHref)}">${primaryLabel}</a></p>
    ${storeLink}
  </div>
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
  const android = isAndroidUserAgent(ua);
  const openAppUrl = android && !isLinkPreviewBot(ua)
    ? androidAppIntentUrl(`/users/${profile.id}`, storeUrl)
    : null;

  if (storeUrl && !android && !isLinkPreviewBot(ua)) {
    return res.redirect(302, storeUrl);
  }

  const title = profile.displayName?.trim() || "Barter member";
  res.setHeader("Content-Security-Policy", SHARE_PREVIEW_CSP);
  return res.type("html").send(
    buildPreviewHtml({
      title,
      description: profile.bio?.trim() || `Check out ${title} on Barter.`,
      imageUrl: profile.avatarUrl ?? null,
      userId: profile.id,
      storeUrl,
      openAppUrl,
    }),
  );
});

export default router;
