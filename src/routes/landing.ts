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

  const appleIcon = `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M16.365 1.43c0 1.14-.417 2.064-1.248 2.772-.963.828-2.124 1.236-3.483 1.164-.035-1.098.396-2.064 1.293-2.898.897-.834 2.07-1.272 3.438-1.38.012.114.018.228.018.342zm3.408 20.447c-.885 1.305-1.932 2.472-3.141 3.501-1.224 1.044-2.238 1.566-3.042 1.566-.768 0-1.593-.522-2.475-1.566-.882-1.044-1.701-1.566-2.457-1.566-.768 0-1.812.534-3.132 1.602-1.32 1.068-2.394 1.602-3.222 1.602-.828 0-1.812-.51-2.952-1.53-1.14-1.02-2.07-2.286-2.79-3.798C1.14 18.234.78 16.458.78 14.502c0-2.244.486-4.164 1.458-5.76.972-1.596 2.274-2.394 3.906-2.394.828 0 1.812.534 2.952 1.602 1.14 1.068 2.058 1.602 2.754 1.602.648 0 1.548-.522 2.7-1.566 1.152-1.044 2.124-1.566 2.916-1.566 1.08 0 2.01.468 2.79 1.404.78.936 1.338 2.124 1.674 3.564-1.548.648-2.322 1.872-2.322 3.672 0 1.416.522 2.604 1.566 3.564 1.044.96 2.274 1.44 3.69 1.44.348 0 .708-.024 1.08-.072-.108.432-.252.864-.432 1.296z"/>
  </svg>`;

  const playIcon = `<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.609 1.814 13.792 12 3.61 22.186a1.002 1.002 0 0 1-1.61-.814V2.628a1.002 1.002 0 0 1 1.61-.814zm12.796 8.902 2.982 1.72a1 1 0 0 1 0 1.732l-2.982 1.72-3.464 2-2.982 1.72a1 1 0 0 1-1.528-.866V5.238a1 1 0 0 1 1.528-.866l2.982 1.72 3.464 2z"/>
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
      --bg-top: #1a2744;
      --bg-bottom: #000000;
      --text: #f5f5f7;
      --muted: #a1a1aa;
      --navy: #1e3a8a;
      --amber: #d97706;
      --amber-bright: #f59e0b;
      --card: rgba(255, 255, 255, 0.04);
      --border: rgba(255, 255, 255, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--text);
      background: radial-gradient(circle at 50% -20%, var(--bg-top) 0%, #121c30 35%, var(--bg-bottom) 100%);
      line-height: 1.5;
    }
    .page {
      max-width: 42rem;
      margin: 0 auto;
      padding: 3.5rem 1.5rem 2.5rem;
      text-align: center;
    }
    .logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 4.5rem;
      height: 4.5rem;
      border-radius: 1.25rem;
      background: linear-gradient(135deg, var(--amber), var(--amber-bright));
      color: #111827;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.04em;
      box-shadow: 0 16px 40px rgba(217, 119, 6, 0.25);
      margin-bottom: 1.5rem;
    }
    h1 {
      margin: 0 0 0.75rem;
      font-size: clamp(2rem, 5vw, 2.75rem);
      letter-spacing: -0.03em;
    }
    .tagline {
      margin: 0 auto 2rem;
      max-width: 28rem;
      color: var(--muted);
      font-size: 1.05rem;
    }
    .card {
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 1.25rem;
      padding: 1.75rem 1.25rem;
      backdrop-filter: blur(8px);
    }
    .card h2 {
      margin: 0 0 0.35rem;
      font-size: 1.125rem;
    }
    .card p {
      margin: 0 0 1.5rem;
      color: var(--muted);
      font-size: 0.95rem;
    }
    .stores {
      display: flex;
      flex-wrap: wrap;
      gap: 0.875rem;
      justify-content: center;
    }
    .store-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 11.5rem;
      padding: 0.75rem 1rem;
      border-radius: 0.875rem;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
      text-decoration: none;
      transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    .store-btn:hover {
      transform: translateY(-1px);
      border-color: rgba(245, 158, 11, 0.45);
      background: rgba(255, 255, 255, 0.09);
    }
    .store-btn--disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .store-btn__text {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      line-height: 1.15;
    }
    .store-btn__sublabel {
      font-size: 0.7rem;
      color: var(--muted);
    }
    .store-btn__label {
      font-size: 1rem;
      font-weight: 600;
    }
    .features {
      display: grid;
      gap: 0.75rem;
      margin-top: 1.75rem;
      text-align: left;
    }
    .feature {
      padding: 0.875rem 1rem;
      border-radius: 0.875rem;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.03);
    }
    .feature strong {
      display: block;
      margin-bottom: 0.15rem;
      color: var(--text);
    }
    .feature span {
      color: var(--muted);
      font-size: 0.9rem;
    }
    footer {
      margin-top: 2.5rem;
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
  <main class="page">
    <div class="logo" aria-hidden="true">B</div>
    <h1>Barter</h1>
    <p class="tagline">Trade what you have. Discover items nearby, make offers, and swap with people in your community.</p>

    <section class="card" aria-labelledby="download-heading">
      <h2 id="download-heading">Get the app</h2>
      <p>Available on iPhone, iPad, and Android.</p>
      <div class="stores">
        ${iosButton}
        ${androidButton}
      </div>

      <div class="features">
        <div class="feature">
          <strong>Swipe to discover</strong>
          <span>Browse local listings and save what catches your eye.</span>
        </div>
        <div class="feature">
          <strong>Make offers &amp; chat</strong>
          <span>Negotiate trades in-app and meet up when you are ready.</span>
        </div>
        <div class="feature">
          <strong>Share listings</strong>
          <span>Send a link — friends with the app open it directly.</span>
        </div>
      </div>
    </section>

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
