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

function buildLandingHtml(): string {
  const iosUrl = env.IOS_APP_STORE_URL ?? null;
  const androidUrl = env.ANDROID_PLAY_STORE_URL ?? null;

  const appleIcon = `<svg viewBox="0 0 24 24" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
  </svg>`;

  const playIcon = `<svg viewBox="0 0 512 512" width="32" height="32" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
    <path fill="#EA4335" d="M325.3 234.3L104.6 13l280.8 161.2-60.1 60.1z"/>
    <path fill="#FBBC04" d="M86.4 256l133.5 77.1 60.1-60.1L86.4 256z"/>
    <path fill="#4285F4" d="M86.4 256l133.5-77.1L104.6 13 86.4 256z"/>
    <path fill="#34A853" d="M325.3 234.3l60.1 60.1 86.4-49.8-146.5-10.3z"/>
  </svg>`;

  const iosButton = buildStoreButton({
    href: iosUrl,
    label: "App Store",
    sublabel: "Download on the",
    className: "store-btn--apple",
    icon: appleIcon,
  });

  const androidButton = buildStoreButton({
    href: androidUrl,
    label: "Google Play",
    sublabel: "Get it on",
    className: "store-btn--google",
    icon: playIcon,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Barter · Trade what you have</title>
  <meta name="description" content="Download Barter for iOS and Android. Discover items nearby, make offers, and trade what you have." />
  <meta name="robots" content="index, follow" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="Barter · Trade what you have" />
  <meta property="og:description" content="Download Barter for iOS and Android. Discover items nearby, make offers, and trade what you have." />
  <meta property="og:url" content="https://www.bartersg.com/" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Barter · Trade what you have" />
  <meta name="twitter:description" content="Download Barter for iOS and Android." />
  <style>
    :root {
      color-scheme: dark;
      --text: #f8fafc;
      --muted: #94a3b8;
      --navy: #1e3a8a;
      --navy-deep: #172554;
      --amber: #d97706;
      --amber-bright: #f59e0b;
      --amber-glow: rgba(245, 158, 11, 0.35);
      --teal: #14b8a6;
      --violet: #8b5cf6;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: #020617;
      line-height: 1.5;
      overflow-x: hidden;
    }
    .bg {
      position: fixed;
      inset: 0;
      z-index: 0;
      background:
        radial-gradient(ellipse 80% 60% at 15% 10%, rgba(30, 58, 138, 0.55) 0%, transparent 55%),
        radial-gradient(ellipse 70% 55% at 85% 15%, rgba(217, 119, 6, 0.35) 0%, transparent 50%),
        radial-gradient(ellipse 60% 50% at 50% 100%, rgba(20, 184, 166, 0.18) 0%, transparent 55%),
        linear-gradient(180deg, #0f172a 0%, #020617 100%);
    }
    .orb {
      position: absolute;
      border-radius: 50%;
      filter: blur(60px);
      pointer-events: none;
    }
    .orb--amber {
      width: 22rem;
      height: 22rem;
      top: -4rem;
      right: 8%;
      background: rgba(245, 158, 11, 0.28);
    }
    .orb--navy {
      width: 28rem;
      height: 28rem;
      bottom: -6rem;
      left: -4rem;
      background: rgba(30, 58, 138, 0.45);
    }
    .page {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      max-width: 80rem;
      margin: 0 auto;
      padding: clamp(2rem, 5vw, 4rem) clamp(1.25rem, 4vw, 3rem);
      display: flex;
      flex-direction: column;
    }
    .hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: clamp(2.5rem, 5vw, 4rem);
      align-items: stretch;
      justify-content: center;
      min-height: calc(100vh - 8rem);
    }
    .hero__brand {
      text-align: center;
      max-width: 44rem;
      margin: 0 auto;
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: clamp(4.5rem, 10vw, 5.5rem);
      height: clamp(4.5rem, 10vw, 5.5rem);
      border-radius: 1.35rem;
      background: linear-gradient(145deg, var(--amber-bright), var(--amber));
      color: #111827;
      font-size: clamp(2rem, 5vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.04em;
      box-shadow: 0 20px 50px var(--amber-glow);
      flex-shrink: 0;
    }
    .badge {
      display: inline-block;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      background: rgba(245, 158, 11, 0.15);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: var(--amber-bright);
      font-size: 0.8rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    h1 {
      margin: 0 0 1rem;
      font-size: clamp(2.75rem, 7vw, 4.5rem);
      line-height: 1.05;
      letter-spacing: -0.04em;
      background: linear-gradient(135deg, #fff 30%, #fde68a 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .tagline {
      margin: 0 auto;
      max-width: 38rem;
      color: var(--muted);
      font-size: clamp(1.05rem, 2.2vw, 1.25rem);
    }
    .panel {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: linear-gradient(160deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%);
      border-radius: 1.75rem;
      padding: clamp(2rem, 5vw, 3.5rem);
      backdrop-filter: blur(16px);
      box-shadow: 0 32px 80px rgba(0, 0, 0, 0.4);
    }
    .panel h2 {
      margin: 0 0 0.5rem;
      font-size: clamp(1.5rem, 3vw, 2rem);
      color: #fff;
    }
    .panel > p {
      margin: 0 0 2.25rem;
      color: var(--muted);
      font-size: clamp(1rem, 2vw, 1.125rem);
    }
    .stores {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.125rem;
    }
    @media (min-width: 640px) {
      .stores { grid-template-columns: 1fr 1fr; }
    }
    .store-btn {
      display: flex;
      align-items: center;
      gap: 1rem;
      width: 100%;
      min-height: 5rem;
      padding: 1.25rem 1.5rem;
      border-radius: 1.125rem;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(15, 23, 42, 0.75);
      color: var(--text);
      text-decoration: none;
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .store-btn:hover {
      transform: translateY(-2px);
      border-color: rgba(245, 158, 11, 0.5);
      box-shadow: 0 12px 32px rgba(245, 158, 11, 0.15);
    }
    .store-btn--apple:hover { border-color: rgba(255, 255, 255, 0.35); box-shadow: 0 12px 32px rgba(255,255,255,0.08); }
    .store-btn--google:hover { border-color: rgba(20, 184, 166, 0.45); box-shadow: 0 12px 32px rgba(20, 184, 166, 0.15); }
    .store-btn--disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .store-btn--disabled:hover {
      transform: none;
      box-shadow: none;
    }
    .store-btn__icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      flex-shrink: 0;
    }
    .store-btn__icon svg { display: block; width: 2.25rem; height: 2.25rem; }
    .store-btn__text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.15;
      min-width: 0;
    }
    .store-btn__sublabel {
      font-size: 0.78rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .store-btn__label {
      font-size: 1.25rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .features {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.125rem;
      margin-top: 2.25rem;
    }
    @media (min-width: 640px) {
      .features { grid-template-columns: repeat(3, 1fr); }
    }
    .feature {
      padding: 1.375rem 1.25rem;
      border-radius: 1.125rem;
      border: 1px solid rgba(255, 255, 255, 0.08);
      text-align: left;
      min-height: 9rem;
    }
    .feature--swipe {
      background: linear-gradient(145deg, rgba(245,158,11,0.18), rgba(245,158,11,0.06));
      border-color: rgba(245, 158, 11, 0.25);
    }
    .feature--chat {
      background: linear-gradient(145deg, rgba(30,58,138,0.35), rgba(30,58,138,0.12));
      border-color: rgba(96, 165, 250, 0.25);
    }
    .feature--share {
      background: linear-gradient(145deg, rgba(20,184,166,0.22), rgba(20,184,166,0.08));
      border-color: rgba(20, 184, 166, 0.25);
    }
    .feature__icon {
      font-size: 1.75rem;
      margin-bottom: 0.5rem;
      line-height: 1;
    }
    .feature strong {
      display: block;
      margin-bottom: 0.35rem;
      color: #fff;
      font-size: 1.05rem;
    }
    .feature span {
      color: var(--muted);
      font-size: 0.925rem;
      line-height: 1.5;
    }
    footer {
      margin-top: auto;
      padding-top: 2.5rem;
      text-align: center;
      color: var(--muted);
      font-size: 0.875rem;
    }
    footer a {
      color: var(--amber-bright);
      text-decoration: none;
    }
    footer a:hover { text-decoration: underline; }
    footer .sep { margin: 0 0.5rem; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true">
    <div class="orb orb--amber"></div>
    <div class="orb orb--navy"></div>
  </div>
  <main class="page">
    <div class="hero">
      <section class="hero__brand">
        <div class="logo-row">
          <div class="logo" aria-hidden="true">B</div>
          <span class="badge">Free on iOS &amp; Android</span>
        </div>
        <h1>Barter</h1>
        <p class="tagline">Trade what you have. Discover items nearby, make offers, and swap with people in your community.</p>
      </section>

      <section class="panel" aria-labelledby="download-heading">
        <h2 id="download-heading">Download the app</h2>
        <p>Available on iPhone, iPad, and Android phones.</p>
        <div class="stores">
          ${iosButton}
          ${androidButton}
        </div>

        <div class="features">
          <div class="feature feature--swipe">
            <div class="feature__icon" aria-hidden="true">✨</div>
            <strong>Swipe to discover</strong>
            <span>Browse local listings and save what catches your eye.</span>
          </div>
          <div class="feature feature--chat">
            <div class="feature__icon" aria-hidden="true">💬</div>
            <strong>Make offers &amp; chat</strong>
            <span>Negotiate trades in-app and meet up when you are ready.</span>
          </div>
          <div class="feature feature--share">
            <div class="feature__icon" aria-hidden="true">🔗</div>
            <strong>Share listings</strong>
            <span>Send a link — friends with the app open it directly.</span>
          </div>
        </div>
      </section>
    </div>

    <footer>
      <a href="/privacy">Privacy</a><span class="sep">·</span>
      <a href="/terms">Terms</a><span class="sep">·</span>
      <a href="mailto:support@bartersg.com">support@bartersg.com</a>
    </footer>
  </main>
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
