import { Router } from "express";
import { env } from "../config/env.js";

const router = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prefersJson(accept: string | undefined): boolean {
  if (!accept) return false;
  const parts = accept.split(",").map((part) => part.trim().split(";")[0]);
  return parts.some((type) => type === "application/json" || type.endsWith("+json"));
}

function buildStoreButton(opts: {
  href: string | null;
  label: string;
  sublabel: string;
  icon: string;
  className: string;
}): string {
  if (!opts.href) {
    return `<span class="store-btn ${opts.className} store-btn--disabled" aria-disabled="true" title="Coming soon">
      <span class="store-btn__icon" aria-hidden="true">${opts.icon}</span>
      <span class="store-btn__text">
        <span class="store-btn__sublabel">${escapeHtml(opts.sublabel)}</span>
        <span class="store-btn__label">${escapeHtml(opts.label)}</span>
      </span>
    </span>`;
  }

  return `<a class="store-btn ${opts.className}" href="${escapeHtml(opts.href)}" rel="noopener noreferrer">
    <span class="store-btn__icon" aria-hidden="true">${opts.icon}</span>
    <span class="store-btn__text">
      <span class="store-btn__sublabel">${escapeHtml(opts.sublabel)}</span>
      <span class="store-btn__label">${escapeHtml(opts.label)}</span>
    </span>
  </a>`;
}

function buildStorePill(opts: {
  href: string | null;
  label: string;
  icon: string;
  className?: string;
}): string {
  const cls = opts.className ?? "";
  if (!opts.href) {
    return `<span class="store-pill store-pill--disabled ${cls}" aria-disabled="true">${opts.icon}<span>${escapeHtml(opts.label)}</span></span>`;
  }
  return `<a class="store-pill ${cls}" href="${escapeHtml(opts.href)}" rel="noopener noreferrer">${opts.icon}<span>${escapeHtml(opts.label)}</span></a>`;
}

const ICON_CAMERA = `<svg class="item-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="6" y="14" width="36" height="24" rx="4" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="26" r="8" stroke="currentColor" stroke-width="2.5"/><path d="M16 14l3-5h10l3 5" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`;

const ICON_GUITAR = `<svg class="item-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><ellipse cx="18" cy="30" rx="10" ry="12" stroke="currentColor" stroke-width="2.5"/><path d="M24 22L40 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M36 10l4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="18" cy="30" r="3.5" fill="currentColor"/></svg>`;

const ICON_RING = `<svg class="item-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="26" r="12" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="26" r="5" stroke="currentColor" stroke-width="2"/><path d="M24 8v6M18 10l3 4M30 10l-3 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;

const ICON_APPLE = `<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
</svg>`;

const ICON_PLAY = `<svg viewBox="0 0 512 512" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
  <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
  <path fill="#FBBC04" d="M86.4 256l133.5 77.1 60.1-60.1L86.4 256z"/>
  <path fill="#4285F4" d="M86.4 256l133.5-77.1L104.6 13 86.4 256z"/>
  <path fill="#34A853" d="M325.3 234.3l60.1 60.1 86.4-49.8-146.5-10.3z"/>
</svg>`;

const ICON_APPLE_SM = `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>`;

const ICON_PLAY_SM = `<svg viewBox="0 0 24 24" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M3 4.5v15l16.5-7.5L3 4.5z"/></svg>`;

function phoneChrome(opts: {
  pill: string;
  activeTab: "swipe" | "nearby" | "inbox" | "me";
  body: string;
  extraClass?: string;
  chapterPhone?: string;
  scene?: string;
  step?: string;
}): string {
  const tabs = [
    { id: "swipe", icon: "✨", label: "Swipe" },
    { id: "nearby", icon: "📍", label: "Nearby" },
    { id: "inbox", icon: "💬", label: "Inbox" },
    { id: "me", icon: "👤", label: "Me" },
  ] as const;

  const tabHtml = tabs
    .map(
      (t) =>
        `<div class="phone__tab${t.id === opts.activeTab ? " is-active" : ""}"><span aria-hidden="true">${t.icon}</span>${t.label}</div>`,
    )
    .join("");

  const attrs = [
    opts.extraClass ? `class="phone ${opts.extraClass}"` : `class="phone"`,
    opts.chapterPhone ? `data-chapter-phone="${opts.chapterPhone}"` : "",
    opts.scene ? `data-scene="${opts.scene}"` : "",
    opts.step != null ? `data-step="${opts.step}"` : 'data-step="0"',
  ]
    .filter(Boolean)
    .join(" ");

  return `<div ${attrs}>
    <div class="phone__notch" aria-hidden="true"></div>
    <div class="phone__screen">
      <div class="phone__topbar">
        <div class="phone__brand"><span class="phone__brand-mark">B</span> Barter</div>
        <div class="phone__pill">${escapeHtml(opts.pill)}</div>
      </div>
      <div class="phone__body">${opts.body}</div>
      <div class="phone__tabs" aria-hidden="true">${tabHtml}</div>
    </div>
    <div class="phone__home" aria-hidden="true"></div>
  </div>`;
}

function swipeSceneBody(): string {
  return `
    <div class="chips" aria-hidden="true">
      <span class="chip is-active">All</span>
      <span class="chip">Electronics</span>
      <span class="chip">Music</span>
    </div>
    <div class="deck">
      <div class="card card--back">
        <div class="card__photo card__photo--camera">${ICON_CAMERA}</div>
        <div class="card__meta"><p class="card__title">Vintage lens</p></div>
      </div>
      <div class="card card--mid">
        <div class="card__photo card__photo--ring">${ICON_RING}</div>
        <div class="card__meta">
          <p class="card__title">Ring light</p>
          <p class="card__sub">~$35 · Good</p>
        </div>
      </div>
      <div class="card card--front">
        <div class="card__photo card__photo--guitar">
          ${ICON_GUITAR}
          <span class="card__badge">Good Match · You have Cameras</span>
          <span class="card__fire">🔥 12</span>
        </div>
        <div class="card__meta">
          <p class="card__title">Acoustic guitar</p>
          <p class="card__sub">~$180 · Like new · Sam</p>
          <div class="card__wants"><span class="want-chip">Wants: Cameras</span></div>
        </div>
      </div>
      <div class="offer-overlay">
        <div class="offer-overlay__card">
          <strong>Interested → make an offer</strong>
          <span>Not a match screen. Propose a trade from your closet.</span>
        </div>
      </div>
    </div>
    <div class="swipe-dock" aria-hidden="true">
      <div class="dock-btn">↩</div>
      <div class="dock-btn dock-btn--pass is-target">✕</div>
      <div class="dock-btn dock-btn--star">★</div>
      <div class="dock-btn dock-btn--like">♥</div>
    </div>`;
}

function nearbySceneBody(): string {
  return `
    <div class="map" aria-hidden="true">
      <div class="map__coast"></div>
      <div class="map__water"></div>
      <div class="radius-ring"></div>
      <div class="pin pin--teal pin--p1"><span>📷</span></div>
      <div class="pin pin--navy pin--p2"><span>🎧</span></div>
      <div class="pin pin--amber pin--guitar pin--p3"><span>🎸</span></div>
      <div class="pin pin--violet pin--p4"><span>📚</span></div>
      <div class="pin pin--teal pin--late pin--p5"><span>🚲</span></div>
      <div class="pin pin--navy pin--late pin--p6"><span>🎮</span></div>
      <div class="nearby-sheet">
        <div class="nearby-sheet__row">
          <div class="nearby-sheet__thumb">${ICON_GUITAR}</div>
          <div>
            <p class="nearby-sheet__title">Acoustic guitar</p>
            <p class="nearby-sheet__meta">2.3 km away · Sam · 🔥 12</p>
          </div>
        </div>
        <div class="nearby-sheet__actions">
          <div class="sheet-btn">Pass</div>
          <div class="sheet-btn sheet-btn--offer">Make an Offer →</div>
        </div>
      </div>
    </div>`;
}

function offerSceneBody(): string {
  return `
    <div class="offer-screen offer-screen--closet">
      <div class="offer-progress"><span class="is-on"></span><span></span><span></span></div>
      <div class="offer-target">
        <div class="offer-target__thumb">${ICON_GUITAR}</div>
        <p><strong>Sam’s guitar</strong>Offer from your closet</p>
      </div>
      <div class="closet-grid">
        <div class="closet-item closet-item--camera">
          <span class="closet-item__check">✓</span>
          ${ICON_CAMERA}
          <span>Camera</span>
        </div>
        <div class="closet-item">
          <span class="closet-item__check">✓</span>
          ${ICON_RING}
          <span>Ring light</span>
        </div>
        <div class="closet-item">
          <span class="closet-item__check">✓</span>
          <svg class="item-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="10" y="8" width="28" height="32" rx="3" stroke="currentColor" stroke-width="2.5"/><path d="M16 16h16M16 24h12" stroke="currentColor" stroke-width="2"/></svg>
          <span>Board game</span>
        </div>
        <div class="closet-item">
          <span class="closet-item__check">✓</span>
          <svg class="item-icon" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2.5"/><circle cx="24" cy="24" r="5" fill="currentColor"/></svg>
          <span>Headphones</span>
        </div>
      </div>
    </div>
    <div class="offer-screen offer-screen--cash">
      <div class="offer-progress"><span class="is-on"></span><span class="is-on"></span><span></span></div>
      <div class="offer-target">
        <div class="offer-target__thumb">${ICON_GUITAR}</div>
        <p><strong>Balancing the trade</strong>Optional cash top-up</p>
      </div>
      <div class="closet-item closet-item--picked is-selected">
        <span class="closet-item__check">✓</span>
        ${ICON_CAMERA}
        <span>Your camera</span>
      </div>
      <div class="cash-panel">
        <p>Values don’t match? Add a little cash.</p>
        <div class="cash-chip">+$20</div>
      </div>
      <div class="send-toast">Offer sent · Waiting for Sam</div>
    </div>
    <div class="offer-screen offer-screen--inbox">
      <div class="inbox-tabs"><span class="is-on">Offers</span><span>Chats</span></div>
      <div class="inbox-card">
        <div class="inbox-card__who">
          <div class="avatar">A</div>
          <div><strong>Alex</strong><span>ACTION NEEDED · Received</span></div>
        </div>
        <div class="trade-panel">
          <div class="trade-side trade-side--theirs">
            <p>They offer</p>
            ${ICON_CAMERA}
            <strong>Camera +$20</strong>
          </div>
          <div class="trade-arrow">↔</div>
          <div class="trade-side trade-side--yours">
            <p>For your</p>
            ${ICON_GUITAR}
            <strong>Guitar</strong>
          </div>
        </div>
        <div class="offer-actions">
          <button type="button">Decline</button>
          <button type="button">Counter</button>
          <button type="button" class="accept">Accept</button>
        </div>
        <div class="accept-banner">Offer accepted — chat started</div>
      </div>
      <div class="sparks" aria-hidden="true">
        <span class="spark"></span>
        <span class="spark"></span>
        <span class="spark"></span>
        <span class="spark"></span>
      </div>
    </div>`;
}

function chatSceneBody(): string {
  return `
    <div class="inbox-tabs"><span>Offers</span><span class="is-on">Chats</span></div>
    <div class="chat-header-trade">
      <div class="mini mini--cam">${ICON_CAMERA}</div>
      <span>↔</span>
      <div class="mini mini--git">${ICON_GUITAR}</div>
    </div>
    <div class="messages">
      <div class="bubble bubble--them">Happy to swap! Bugis works?</div>
      <div class="bubble bubble--me">Perfect — after 6?</div>
      <div class="bubble bubble--them">See you at the MRT exit.</div>
    </div>
    <div class="trade-bar">
      <button type="button" class="primary">Find Meeting Point</button>
      <button type="button">Mark Complete</button>
      <button type="button">Cancel</button>
    </div>
    <div class="meetup-sheet">
      <h4>Meeting points near midpoint</h4>
      <div class="meetup-stop is-picked">Bugis MRT · 4 min walk</div>
      <div class="meetup-stop">City Hall MRT</div>
      <div class="meetup-stop">Plaza Singapura</div>
    </div>
    <div class="complete-card">
      <div class="seal" aria-hidden="true">✅</div>
      <strong>Trade complete</strong>
      <p>Leave a sealed review for Sam.</p>
    </div>`;
}

function buildLandingHtml(): string {
  const iosUrl = env.IOS_APP_STORE_URL ?? null;
  const androidUrl = env.ANDROID_PLAY_STORE_URL ?? null;

  const iosButton = buildStoreButton({
    href: iosUrl,
    label: "App Store",
    sublabel: "Download on the",
    className: "store-btn--apple",
    icon: ICON_APPLE,
  });

  const androidButton = buildStoreButton({
    href: androidUrl,
    label: "Google Play",
    sublabel: "Get it on",
    className: "store-btn--google",
    icon: ICON_PLAY,
  });

  const iosPill = buildStorePill({ href: iosUrl, label: "App Store", icon: ICON_APPLE_SM });
  const androidPill = buildStorePill({ href: androidUrl, label: "Google Play", icon: ICON_PLAY_SM });

  const heroPhone = phoneChrome({
    pill: "Swipe",
    activeTab: "swipe",
    body: swipeSceneBody(),
    extraClass: "phone--hero",
    scene: "swipe",
    step: "0",
  });

  const swipePhone = phoneChrome({
    pill: "Swipe",
    activeTab: "swipe",
    body: swipeSceneBody(),
    chapterPhone: "swipe",
    scene: "swipe",
    step: "0",
  });

  const nearbyPhone = phoneChrome({
    pill: "12 nearby",
    activeTab: "nearby",
    body: nearbySceneBody(),
    chapterPhone: "nearby",
    scene: "nearby",
    step: "0",
  });

  const offerPhone = phoneChrome({
    pill: "Make offer",
    activeTab: "inbox",
    body: offerSceneBody(),
    chapterPhone: "offer",
    scene: "offer",
    step: "0",
  });

  const chatPhone = phoneChrome({
    pill: "Pending meetup",
    activeTab: "inbox",
    body: chatSceneBody(),
    chapterPhone: "chat",
    scene: "chat",
    step: "0",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barter · Trade what you have</title>
  <meta name="description" content="Don’t sell first. Swap first. Download Barter for iOS and Android — swipe nearby items, make offers from your closet, and meet up locally." />
  <meta name="robots" content="index, follow" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Barter · Don’t sell first. Swap first." />
  <meta property="og:description" content="List what you have. Say what you want back. Meet nearby. Free on iOS and Android." />
  <meta property="og:url" content="https://www.bartersg.com/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Barter · Trade what you have" />
  <meta name="twitter:description" content="Don’t sell first. Swap first. Download Barter for iOS and Android." />
  <link rel="stylesheet" href="/landing/landing.css" />
</head>
<body>
  <div class="bg" aria-hidden="true">
    <div class="orb orb--amber"></div>
    <div class="orb orb--navy"></div>
  </div>

  <header class="topnav">
    <a class="topnav__brand" href="#top">
      <span class="logo-mark" aria-hidden="true">B</span>
      <span>Barter</span>
    </a>
    <nav class="topnav__links" aria-label="How it works">
      <a data-nav-link href="#swipe">Swipe</a>
      <a data-nav-link href="#nearby">Nearby</a>
      <a data-nav-link href="#offers">Offers</a>
      <a data-nav-link href="#chat">Chat</a>
    </nav>
    <div class="topnav__stores">
      <div class="nav-menu-wrap">
        <button type="button" class="nav-menu-btn" data-nav-menu aria-expanded="false">How it works</button>
        <div class="nav-popover" data-nav-popover>
          <a href="#swipe">Swipe</a>
          <a href="#nearby">Nearby</a>
          <a href="#offers">Offers</a>
          <a href="#chat">Chat</a>
        </div>
      </div>
      ${iosPill}
      ${androidPill}
    </div>
  </header>

  <main class="page" id="top">
    <section class="hero">
      <div class="hero__phone">${heroPhone}</div>
      <div class="hero__copy">
        <div class="hero__logo-row">
          <div class="logo-mark logo-mark--lg" aria-hidden="true">B</div>
          <span class="section__eyebrow">Free on iOS &amp; Android</span>
        </div>
        <h1>Don’t sell first. Swap first.</h1>
        <p class="hero__tagline">List what you have. Say what you want back. Meet nearby.</p>
        <div class="stores" aria-label="Download the app">
          ${iosButton}
          ${androidButton}
        </div>
      </div>
    </section>

    <section class="section problem" aria-labelledby="problem-heading">
      <h2 id="problem-heading">Most apps are built to sell. Barter is built to trade.</h2>
      <p class="section__lead section__lead--center">Follow Alex’s camera and Sam’s guitar — one trade, four moments.</p>
      <div class="compare">
        <div class="compare__card compare__card--sell">
          <h3>Sell first</h3>
          <ul>
            <li>“Still available?” threads</li>
            <li>Wait for cash, then hunt again</li>
            <li>Everything starts with a price tag</li>
          </ul>
        </div>
        <div class="compare__card compare__card--swap">
          <h3>Swap first</h3>
          <ul>
            <li>A real offer from someone’s closet</li>
            <li>Camera ↔ guitar in one move</li>
            <li>Wanted categories, not just cash</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section chapter" id="swipe" data-chapter="swipe" aria-labelledby="swipe-heading">
      <div class="chapter__grid">
        <div class="chapter__copy">
          <span class="section__eyebrow">01 · Swipe</span>
          <h2 id="swipe-heading">Discover like a deck. Offer like a trader.</h2>
          <p class="section__lead">Right swipe means you’re interested in a trade — not a mutual match.</p>
          <div class="steps">
            <div class="step is-active" data-step="0">
              <span class="step__num">Step 1</span>
              <strong>Swipe a deck of nearby listings</strong>
              <p>Sam’s guitar shows estimated value, condition, and what they want back — Cameras.</p>
            </div>
            <div class="step" data-step="1">
              <span class="step__num">Step 2</span>
              <strong>Left to pass</strong>
              <p>Not for you? Swipe left. Rewind if you change your mind.</p>
            </div>
            <div class="step" data-step="2">
              <span class="step__num">Step 3</span>
              <strong>Right if you want to trade</strong>
              <p>Match badges score how well your closet fits their wants — e.g. “You have Cameras.”</p>
            </div>
            <div class="step" data-step="3">
              <span class="step__num">Step 4</span>
              <strong>Not a match screen</strong>
              <p>Interest opens the offer flow. No “It’s a Match!” — propose a real swap.</p>
            </div>
          </div>
        </div>
        <div class="chapter__phone-wrap">
          ${swipePhone}
          <button type="button" class="replay-btn" data-replay="swipe" data-replay-max="3">Replay swipe</button>
        </div>
      </div>
    </section>

    <section class="section chapter" id="nearby" data-chapter="nearby" aria-labelledby="nearby-heading">
      <div class="chapter__grid">
        <div class="chapter__copy">
          <span class="section__eyebrow">02 · Nearby</span>
          <h2 id="nearby-heading">Same items, on a map.</h2>
          <p class="section__lead">Explore what’s around you within your trade radius — then make the same offer.</p>
          <div class="steps">
            <div class="step is-active" data-step="0">
              <span class="step__num">Step 1</span>
              <strong>See what’s around you</strong>
              <p>Category-colored pins drop onto a local map of listings near you.</p>
            </div>
            <div class="step" data-step="1">
              <span class="step__num">Step 2</span>
              <strong>Stay inside your radius</strong>
              <p>Widen from 2 km to 5 km and more pins appear. Meetups stay practical.</p>
            </div>
            <div class="step" data-step="2">
              <span class="step__num">Step 3</span>
              <strong>Tap a pin</strong>
              <p>Sam’s guitar slides up: distance, fire count, and a clear next step.</p>
            </div>
            <div class="step" data-step="3">
              <span class="step__num">Step 4</span>
              <strong>Make an Offer →</strong>
              <p>Same offer path as Swipe — map exploration is just another way in.</p>
            </div>
          </div>
        </div>
        <div class="chapter__phone-wrap">
          ${nearbyPhone}
          <button type="button" class="replay-btn" data-replay="nearby" data-replay-max="3">Replay nearby</button>
        </div>
      </div>
    </section>

    <section class="section chapter" id="offers" data-chapter="offer" aria-labelledby="offers-heading">
      <div class="chapter__grid">
        <div class="chapter__copy">
          <span class="section__eyebrow">03 · Offers</span>
          <h2 id="offers-heading">Propose a trade. Don’t just like it.</h2>
          <p class="section__lead">Alex offers a camera (and a little cash) for Sam’s guitar. Negotiate until it feels fair.</p>
          <div class="steps">
            <div class="step is-active" data-step="0">
              <span class="step__num">Step 1</span>
              <strong>Offer from your closet</strong>
              <p>Pick one item or a bundle — you must offer something real.</p>
            </div>
            <div class="step" data-step="1">
              <span class="step__num">Step 2</span>
              <strong>Balance with cash if needed</strong>
              <p>Values don’t line up? Add an optional top-up like +$20.</p>
            </div>
            <div class="step" data-step="2">
              <span class="step__num">Step 3</span>
              <strong>Send the offer</strong>
              <p>No “still available?” — Sam gets a concrete proposal.</p>
            </div>
            <div class="step" data-step="3">
              <span class="step__num">Step 4</span>
              <strong>Seller decides</strong>
              <p>Decline, counter, or accept. Trade panel shows both sides clearly.</p>
            </div>
            <div class="step" data-step="4">
              <span class="step__num">Step 5</span>
              <strong>Counter is ping-pong</strong>
              <p>Turn-based revisions — up to 6 rounds — until you’re aligned.</p>
            </div>
            <div class="step" data-step="5">
              <span class="step__num">Step 6</span>
              <strong>Accept → chat starts</strong>
              <p>That’s the emotional beat: offer accepted, conversation opens.</p>
            </div>
          </div>
        </div>
        <div class="chapter__phone-wrap">
          ${offerPhone}
          <button type="button" class="replay-btn" data-replay="offer" data-replay-max="5">Replay offer</button>
        </div>
      </div>
    </section>

    <section class="section chapter" id="chat" data-chapter="chat" aria-labelledby="chat-heading">
      <div class="chapter__grid">
        <div class="chapter__copy">
          <span class="section__eyebrow">04 · Chat</span>
          <h2 id="chat-heading">Align, then meet.</h2>
          <p class="section__lead">Coordinate the handoff after you’re both in. Public meetup. No shipping.</p>
          <div class="steps">
            <div class="step is-active" data-step="0">
              <span class="step__num">Step 1</span>
              <strong>Chat after you’re aligned</strong>
              <p>Inbox splits Offers and Chats — negotiate first, then coordinate.</p>
            </div>
            <div class="step" data-step="1">
              <span class="step__num">Step 2</span>
              <strong>Items stay in the header</strong>
              <p>Camera ↔ guitar stays visible so you never lose the trade context.</p>
            </div>
            <div class="step" data-step="2">
              <span class="step__num">Step 3</span>
              <strong>Find a midpoint</strong>
              <p>Barter suggests neutral stops — Bugis MRT, City Hall, a mall nearby.</p>
            </div>
            <div class="step" data-step="3">
              <span class="step__num">Step 4</span>
              <strong>Mark complete</strong>
              <p>Confirm the swap happened, then leave a sealed review.</p>
            </div>
          </div>
          <p class="safety-note">Public meetup. No shipping. No in-app payments. Barter connects traders — you arrange the exchange in person.</p>
        </div>
        <div class="chapter__phone-wrap">
          ${chatPhone}
          <button type="button" class="replay-btn" data-replay="chat" data-replay-max="3">Replay chat</button>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="download-heading">
      <div class="cta">
        <h2 id="download-heading">Download Barter and trade what you have.</h2>
        <p>Available on iPhone, iPad, and Android phones.</p>
        <div class="stores">
          ${iosButton}
          ${androidButton}
        </div>
      </div>
    </section>

    <footer>
      <a href="/privacy">Privacy</a><span class="sep">·</span>
      <a href="/terms">Terms</a><span class="sep">·</span>
      <a href="/delete-account">Delete account</a><span class="sep">·</span>
      <a href="mailto:support@bartersg.com">support@bartersg.com</a>
    </footer>
  </main>
  <script src="/landing/landing.js" defer></script>
</body>
</html>`;
}

// ─── GET / ────────────────────────────────────────────────────────────────────
// Public landing page for https://www.bartersg.com — store download links.
// JSON is returned only when the client explicitly asks for application/json.
router.get("/", (req, res) => {
  const accept = req.headers.accept;
  if (prefersJson(accept)) {
    return res.json({
      service: "swaphaven-api",
      health: "/api/healthz",
      ready: "/api/readyz",
      docs: env.ENABLE_API_DOCS ? "/api-docs" : undefined,
    });
  }

  return res.type("html").send(buildLandingHtml());
});

export default router;
