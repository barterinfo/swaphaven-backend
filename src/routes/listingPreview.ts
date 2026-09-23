import { Router } from "express";
import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db } from "../db/client.js";
import { listingsTable, listingImagesTable } from "../db/schema/index.js";
import { env } from "../config/env.js";
import { isUuid } from "../lib/barter-listing.js";
import { filterListingImageUrls } from "../lib/media.js";
import { p } from "../lib/route-helpers.js";
import {
  SHARE_PREVIEW_CSP,
  androidAppIntentUrl,
  escapeHtml,
  isAndroidUserAgent,
  isLinkPreviewBot,
  publicListingDescription,
  storeUrlForUserAgent,
} from "../lib/share-preview.js";

const router = Router();

const MORE_ITEMS_LIMIT = 24;
const MOSAIC_POOL_LIMIT = 100;

type SpotlightItem = { id: string; title: string; imageUrl: string };

const ICON_APPLE = `<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
</svg>`;

const ICON_PLAY = `<svg viewBox="0 0 512 512" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
  <path fill="#FBBC04" d="M86.4 256l133.5 77.1 60.1-60.1L86.4 256z"/>
  <path fill="#4285F4" d="M86.4 256l133.5-77.1L104.6 13 86.4 256z"/>
  <path fill="#34A853" d="M325.3 234.3l60.1 60.1 86.4-49.8-146.5-10.3z"/>
</svg>`;

async function loadSpotlightItems(opts: {
  limit: number;
  excludeId?: string;
}): Promise<SpotlightItem[]> {
  const cover = db
    .selectDistinctOn([listingImagesTable.listingId], {
      listingId: listingImagesTable.listingId,
      url: listingImagesTable.url,
    })
    .from(listingImagesTable)
    .orderBy(asc(listingImagesTable.listingId), asc(listingImagesTable.position))
    .as("cover");

  const conditions = [eq(listingsTable.status, "active")];
  if (opts.excludeId) conditions.push(ne(listingsTable.id, opts.excludeId));

  const rows = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      imageUrl: cover.url,
    })
    .from(listingsTable)
    .innerJoin(cover, eq(cover.listingId, listingsTable.id))
    .where(and(...conditions))
    .orderBy(
      desc(listingsTable.rightSwipeCount),
      desc(listingsTable.viewCount),
      desc(listingsTable.createdAt),
    )
    .limit(opts.limit);

  return rows.flatMap((row) => {
    const imageUrl = filterListingImageUrls([row.imageUrl])[0];
    if (!imageUrl) return [];
    return [{ id: row.id, title: row.title, imageUrl }];
  });
}

function buildStoreButton(opts: {
  href: string;
  label: string;
  sublabel: string;
  icon: string;
  className: string;
}): string {
  return `<a class="store-btn ${opts.className}" href="${escapeHtml(opts.href)}" rel="noopener noreferrer">
    <span class="store-btn__icon" aria-hidden="true">${opts.icon}</span>
    <span class="store-btn__text">
      <span class="store-btn__sublabel">${escapeHtml(opts.sublabel)}</span>
      <span class="store-btn__label">${escapeHtml(opts.label)}</span>
    </span>
  </a>`;
}

function buildStoreActions(opts: {
  storeUrl: string | null;
  openAppUrl: string | null;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
}): string {
  if (opts.openAppUrl) {
    let html = `<a class="btn btn--primary" href="${escapeHtml(opts.openAppUrl)}">Open in Barter</a>`;
    if (opts.storeUrl) {
      html += `<a class="btn btn--ghost" href="${escapeHtml(opts.storeUrl)}">Get the app</a>`;
    }
    return `<div class="actions">${html}</div>`;
  }

  if (opts.storeUrl) {
    // Single-store mobile handoff (rare here — iOS usually redirects).
    const isApple = /apps\.apple\.com/i.test(opts.storeUrl);
    return `<div class="stores">${buildStoreButton({
      href: opts.storeUrl,
      label: isApple ? "App Store" : "Google Play",
      sublabel: isApple ? "Download on the" : "Get it on",
      icon: isApple ? ICON_APPLE : ICON_PLAY,
      className: isApple ? "store-btn--apple" : "store-btn--google",
    })}</div>`;
  }

  const buttons: string[] = [];
  if (opts.iosStoreUrl) {
    buttons.push(
      buildStoreButton({
        href: opts.iosStoreUrl,
        label: "App Store",
        sublabel: "Download on the",
        icon: ICON_APPLE,
        className: "store-btn--apple",
      }),
    );
  }
  if (opts.androidStoreUrl) {
    buttons.push(
      buildStoreButton({
        href: opts.androidStoreUrl,
        label: "Google Play",
        sublabel: "Get it on",
        icon: ICON_PLAY,
        className: "store-btn--google",
      }),
    );
  }
  if (!buttons.length) {
    return `<div class="actions"><a class="btn btn--primary" href="#">Open in Barter</a></div>`;
  }
  return `<div class="stores">${buttons.join("")}</div>
<p class="hint">Get Barter, then open this item from the app.</p>`;
}

function buildMoreGrid(items: SpotlightItem[]): string {
  if (!items.length) return "";
  const cards = items
    .map(
      (item) => `<a class="more-card" href="/listings/${escapeHtml(item.id)}">
  <div class="more-card__photo"><img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer" /></div>
  <p class="more-card__title">${escapeHtml(item.title)}</p>
</a>`,
    )
    .join("");
  return `<section class="more" aria-labelledby="more-heading">
  <div class="more__head">
    <h2 id="more-heading">More on Barter</h2>
    <p>Tap any item to open it in the app</p>
  </div>
  <div class="more__grid">${cards}</div>
</section>`;
}

/** Same large/small mosaic pattern used on the home page (wide layout). */
function mosaicCells(): { c: number; r: number; w: number; h: number }[] {
  const cols = 8;
  const rows = 6;
  const larges: [number, number][] = [
    [0, 0],
    [3, 0],
    [6, 1],
    [1, 2],
    [4, 3],
    [0, 4],
    [6, 4],
  ];
  const taken = Array.from({ length: rows }, () => Array(cols).fill(false));
  const placed: { c: number; r: number; w: number; h: number }[] = [];

  function free(c: number, r: number, w: number, h: number): boolean {
    if (c < 0 || r < 0 || c + w > cols || r + h > rows) return false;
    for (let y = r; y < r + h; y += 1) {
      for (let x = c; x < c + w; x += 1) {
        if (taken[y]![x]) return false;
      }
    }
    return true;
  }

  function take(c: number, r: number, w: number, h: number): void {
    for (let y = r; y < r + h; y += 1) {
      for (let x = c; x < c + w; x += 1) taken[y]![x] = true;
    }
    placed.push({ c, r, w, h });
  }

  for (const [c, r] of larges) {
    if (free(c, r, 2, 2)) take(c, r, 2, 2);
  }
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!taken[r]![c]) take(c, r, 1, 1);
    }
  }
  return placed;
}

function buildMosaic(items: SpotlightItem[]): string {
  const cells = mosaicCells();
  const tiles = items.length
    ? cells
        .map((cell, i) => {
          const item = items[i % items.length]!;
          const cls = cell.w > 1 ? "bg-tile bg-tile--lg" : "bg-tile";
          return `<div class="${cls}" style="grid-column:${cell.c + 1} / span ${cell.w};grid-row:${cell.r + 1} / span ${cell.h}">
  <img class="is-shown" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-mosaic-front />
  <img alt="" referrerpolicy="no-referrer" data-mosaic-back />
</div>`;
        })
        .join("")
    : "";
  const mosaicClass = items.length ? "bg-mosaic is-ready" : "bg-mosaic";
  return `<div class="bg" aria-hidden="true">
  <div class="${mosaicClass}" data-listing-mosaic style="grid-template-columns:repeat(8,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr))">${tiles}</div>
  <div class="bg-veil"></div>
  <div class="orb orb--amber"></div>
  <div class="orb orb--navy"></div>
</div>`;
}

function mosaicScript(pool: SpotlightItem[]): string {
  if (pool.length < 2) return "";
  const payload = JSON.stringify(pool.map((p) => ({ id: p.id, imageUrl: p.imageUrl })));
  return `<script>
(() => {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return;
  const pool = ${payload};
  const root = document.querySelector("[data-listing-mosaic]");
  if (!root || pool.length < 2) return;
  const tiles = Array.from(root.querySelectorAll(".bg-tile")).map((el) => ({
    el,
    front: el.querySelector("[data-mosaic-front]"),
    back: el.querySelector("[data-mosaic-back]"),
    itemId: null,
  }));
  function usedIds(except) {
    const ids = new Set();
    tiles.forEach((t) => { if (t !== except && t.itemId) ids.add(t.itemId); });
    return ids;
  }
  function pick(except) {
    const used = usedIds(except);
    let choices = pool.filter((p) => !used.has(p.id) && p.id !== except.itemId);
    if (!choices.length) choices = pool.filter((p) => p.id !== except.itemId);
    return choices[Math.floor(Math.random() * choices.length)] || null;
  }
  function show(tile, item) {
    if (!item || !tile.front || !tile.back) return;
    const incoming = tile.front.classList.contains("is-shown") ? tile.back : tile.front;
    const outgoing = incoming === tile.front ? tile.back : tile.front;
    incoming.onload = () => {
      incoming.classList.add("is-shown");
      outgoing.classList.remove("is-shown");
      tile.itemId = item.id;
    };
    incoming.src = item.imageUrl;
  }
  tiles.forEach((tile, i) => { tile.itemId = pool[i % pool.length].id; });
  window.setInterval(() => {
    const tile = tiles[Math.floor(Math.random() * tiles.length)];
    const next = pick(tile);
    if (next) show(tile, next);
  }, 3200);
})();
</script>`;
}

function buildPreviewHtml(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  listingId: string;
  storeUrl: string | null;
  openAppUrl: string | null;
  iosStoreUrl: string | null;
  androidStoreUrl: string | null;
  moreItems: SpotlightItem[];
  mosaicItems: SpotlightItem[];
}): string {
  const title = escapeHtml(opts.title);
  const description = escapeHtml(
    publicListingDescription(opts.description) || "Check out this item on Barter.",
  );
  const imageMeta = opts.imageUrl
    ? `<meta property="og:image" content="${escapeHtml(opts.imageUrl)}" />`
    : "";
  const canonical = `https://www.bartersg.com/listings/${escapeHtml(opts.listingId)}`;
  const autoTarget = opts.openAppUrl ?? null;
  const autoOpen = autoTarget
    ? `<meta http-equiv="refresh" content="0;url=${escapeHtml(autoTarget)}" />
<script>window.location.replace(${JSON.stringify(autoTarget)});</script>`
    : "";
  const actions = buildStoreActions(opts);
  const heroImage = opts.imageUrl
    ? `<div class="hero__photo"><img src="${escapeHtml(opts.imageUrl)}" alt="${title}" referrerpolicy="no-referrer" /></div>`
    : `<div class="hero__photo hero__photo--empty" aria-hidden="true"><span>B</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Barter</title>
  <meta name="description" content="${description}" />
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
    :root {
      --text: #f8fafc;
      --muted: #94a3b8;
      --amber: #d97706;
      --amber-bright: #f59e0b;
      --amber-glow: rgba(245, 158, 11, 0.35);
      --navy: #1e3a8a;
      --border: rgba(255, 255, 255, 0.12);
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: #020617;
      line-height: 1.5;
      overflow-x: hidden;
    }
    a { color: var(--amber-bright); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .bg {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 80% 60% at 15% 10%, rgba(30, 58, 138, 0.55) 0%, transparent 55%),
        radial-gradient(ellipse 70% 55% at 85% 15%, rgba(217, 119, 6, 0.35) 0%, transparent 50%),
        radial-gradient(ellipse 60% 50% at 50% 100%, rgba(20, 184, 166, 0.18) 0%, transparent 55%),
        linear-gradient(180deg, #0f172a 0%, #020617 100%);
    }
    .bg-mosaic {
      position: absolute; inset: -7%; display: grid; gap: 0.55rem;
      opacity: 0; transition: opacity 0.8s ease; pointer-events: none;
    }
    .bg-mosaic.is-ready { opacity: 1; }
    .bg-tile {
      position: relative; min-width: 0; min-height: 0; overflow: hidden;
      border-radius: 0.85rem; background: rgba(255, 255, 255, 0.04);
    }
    .bg-tile img {
      position: absolute; inset: 0; width: 100%; height: 100%;
      object-fit: cover; opacity: 0; filter: saturate(0.9);
      transition: opacity 0.9s ease;
    }
    .bg-tile img.is-shown { opacity: 1; }
    .bg-veil {
      position: absolute; inset: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 80% 60% at 15% 10%, rgba(30, 58, 138, 0.5) 0%, transparent 55%),
        radial-gradient(ellipse 70% 55% at 85% 15%, rgba(217, 119, 6, 0.28) 0%, transparent 50%),
        linear-gradient(180deg, rgba(15, 23, 42, 0.58) 0%, rgba(2, 6, 23, 0.66) 100%);
    }
    .orb {
      position: absolute; z-index: 2; border-radius: 50%;
      filter: blur(60px); pointer-events: none;
    }
    .orb--amber {
      width: 22rem; height: 22rem; top: -4rem; right: 8%;
      background: rgba(245, 158, 11, 0.28);
    }
    .orb--navy {
      width: 28rem; height: 28rem; bottom: -6rem; left: -4rem;
      background: rgba(30, 58, 138, 0.45);
    }
    .topnav {
      position: sticky; top: 0; z-index: 50;
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; padding: 0.9rem clamp(1rem, 3vw, 2rem);
      border-bottom: 1px solid var(--border);
      background: rgba(2, 6, 23, 0.82);
      backdrop-filter: blur(14px);
    }
    .brand {
      display: inline-flex; align-items: center; gap: 0.6rem;
      color: var(--text); font-weight: 700; letter-spacing: -0.02em;
      text-decoration: none;
    }
    .brand:hover { text-decoration: none; opacity: 0.92; }
    .brand__name { font-size: 1.05rem; }
    @media (max-width: 640px) {
      .brand__name { display: none; }
      .topnav { gap: 0.5rem; padding: 0.9rem 0.75rem; }
    }
    .logo-mark {
      display: inline-flex; align-items: center; justify-content: center;
      width: 2rem; height: 2rem; border-radius: 0.55rem;
      background: linear-gradient(145deg, var(--amber-bright), var(--amber));
      color: #111827; font-size: 1rem; font-weight: 800;
      box-shadow: 0 8px 20px var(--amber-glow); flex-shrink: 0;
    }
    .page {
      position: relative; z-index: 1;
      max-width: 72rem; margin: 0 auto;
      padding: clamp(1.5rem, 4vw, 2.5rem) clamp(1.25rem, 4vw, 2.5rem) 3.5rem;
    }
    .spotlight {
      display: grid; gap: 1.5rem; align-items: start;
      margin-bottom: clamp(2.5rem, 6vw, 4rem);
    }
    @media (min-width: 800px) {
      .spotlight { grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); gap: 2rem; }
    }
    .hero__photo {
      position: relative; overflow: hidden; border-radius: 1.25rem;
      border: 1px solid var(--border); background: rgba(15, 23, 42, 0.72);
      aspect-ratio: 1; box-shadow: 0 28px 70px rgba(0, 0, 0, 0.45);
      backdrop-filter: blur(8px);
    }
    .hero__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .hero__photo--empty {
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(145deg, rgba(245, 158, 11, 0.35), rgba(30, 58, 138, 0.45));
      font-size: 4rem; font-weight: 800; color: #111827;
    }
    .hero__copy {
      text-align: left;
      padding: 1.25rem 1.35rem;
      border-radius: 1.25rem;
      border: 1px solid var(--border);
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(12px);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }
    .eyebrow {
      display: inline-block; margin-bottom: 0.75rem; padding: 0.3rem 0.7rem;
      border-radius: 999px; background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3); color: var(--amber-bright);
      font-size: 0.75rem; font-weight: 600; letter-spacing: 0.03em;
    }
    h1 {
      margin: 0 0 0.75rem; font-size: clamp(1.75rem, 4vw, 2.5rem);
      line-height: 1.15; letter-spacing: -0.03em;
    }
    .desc { margin: 0 0 1.5rem; color: var(--muted); font-size: 1.05rem; max-width: 36rem; }
    .actions { display: flex; flex-wrap: wrap; gap: 0.65rem; }
    .stores {
      display: grid; gap: 0.75rem; max-width: 28rem;
    }
    @media (min-width: 520px) {
      .stores { grid-template-columns: 1fr 1fr; }
    }
    .store-btn {
      display: flex; align-items: center; gap: 0.85rem; width: 100%;
      min-height: 4.25rem; padding: 0.9rem 1.15rem; border-radius: 1rem;
      border: 1px solid var(--border); background: rgba(15, 23, 42, 0.88);
      color: var(--text); text-decoration: none;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .store-btn:hover {
      transform: translateY(-2px); text-decoration: none;
      border-color: rgba(245, 158, 11, 0.5);
      box-shadow: 0 12px 32px rgba(245, 158, 11, 0.15);
    }
    .store-btn--apple:hover {
      border-color: rgba(255, 255, 255, 0.35);
      box-shadow: 0 12px 32px rgba(255, 255, 255, 0.08);
    }
    .store-btn--google:hover {
      border-color: rgba(20, 184, 166, 0.45);
      box-shadow: 0 12px 32px rgba(20, 184, 166, 0.15);
    }
    .store-btn__icon {
      display: flex; align-items: center; justify-content: center;
      width: 2.25rem; height: 2.25rem; flex-shrink: 0;
    }
    .store-btn__icon svg { display: block; width: 2rem; height: 2rem; }
    .store-btn__text {
      display: flex; flex-direction: column; align-items: flex-start;
      line-height: 1.15; min-width: 0;
    }
    .store-btn__sublabel {
      font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em;
    }
    .store-btn__label { font-size: 1.05rem; font-weight: 700; letter-spacing: -0.02em; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 2.85rem; padding: 0.7rem 1.2rem; border-radius: 0.9rem;
      font-weight: 700; text-decoration: none; border: 1px solid transparent;
    }
    .btn:hover { text-decoration: none; filter: brightness(1.05); }
    .btn--primary {
      background: linear-gradient(145deg, var(--amber-bright), var(--amber));
      color: #111827; box-shadow: 0 12px 28px var(--amber-glow);
    }
    .btn--ghost {
      background: rgba(255, 255, 255, 0.06); color: var(--text);
      border-color: var(--border);
    }
    .hint { margin: 0.9rem 0 0; color: var(--muted); font-size: 0.9rem; }
    .more {
      padding: 1.25rem 1.35rem 1.5rem;
      border-radius: 1.25rem;
      border: 1px solid var(--border);
      background: rgba(2, 6, 23, 0.72);
      backdrop-filter: blur(12px);
    }
    .more__head { margin-bottom: 1rem; }
    .more__head h2 {
      margin: 0 0 0.35rem; font-size: clamp(1.25rem, 3vw, 1.6rem);
      letter-spacing: -0.02em;
    }
    .more__head p { margin: 0; color: var(--muted); font-size: 0.9rem; }
    .more__grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.85rem;
    }
    @media (min-width: 640px) {
      .more__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (min-width: 900px) {
      .more__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
    }
    .more-card {
      display: flex; flex-direction: column; gap: 0.45rem;
      color: var(--text); text-decoration: none; border-radius: 0.95rem;
      transition: transform 0.2s ease;
    }
    .more-card:hover { text-decoration: none; transform: translateY(-2px); }
    .more-card__photo {
      aspect-ratio: 1; overflow: hidden; border-radius: 0.85rem;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.04);
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
    }
    .more-card__photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .more-card__title {
      margin: 0; padding: 0 0.15rem; font-size: 0.85rem; font-weight: 600;
      line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    footer {
      margin-top: 2.5rem; padding-top: 1.25rem; border-top: 1px solid var(--border);
      text-align: center; color: var(--muted); font-size: 0.85rem;
    }
    footer .sep { margin: 0 0.5rem; opacity: 0.5; }
    @media (prefers-reduced-motion: reduce) {
      .bg-tile img { transition: none; }
    }
  </style>
</head>
<body>
  ${buildMosaic(opts.mosaicItems)}
  <header class="topnav">
    <a class="brand" href="/" aria-label="Barter home">
      <span class="logo-mark" aria-hidden="true">B</span>
      <span class="brand__name">Barter</span>
    </a>
    <a href="/">Home</a>
  </header>
  <main class="page">
    <section class="spotlight">
      ${heroImage}
      <div class="hero__copy">
        <span class="eyebrow">On Barter now</span>
        <h1>${title}</h1>
        <p class="desc">${description}</p>
        ${actions}
      </div>
    </section>
    ${buildMoreGrid(opts.moreItems)}
    <footer>
      <a href="/">Home</a><span class="sep">·</span>
      <a href="/privacy">Privacy</a><span class="sep">·</span>
      <a href="/terms">Terms</a>
    </footer>
  </main>
  ${mosaicScript(opts.mosaicItems)}
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

  const [images, mosaicItems, moreItems] = await Promise.all([
    db.query.listingImagesTable.findMany({
      where: eq(listingImagesTable.listingId, listing.id),
      orderBy: (t, { asc }) => [asc(t.position)],
      columns: { url: true },
      limit: 1,
    }),
    loadSpotlightItems({ limit: MOSAIC_POOL_LIMIT }),
    loadSpotlightItems({ limit: MORE_ITEMS_LIMIT, excludeId: listing.id }),
  ]);
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
      moreItems,
      mosaicItems,
    }),
  );
});

export default router;
