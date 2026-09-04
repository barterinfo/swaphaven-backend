import { env } from "../config/env.js";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isLinkPreviewBot(ua: string): boolean {
  return /bot|crawler|spider|facebookexternalhit|twitterbot|slackbot|whatsapp|telegram|discord|linkedin|preview/i.test(
    ua,
  );
}

export function isAndroidUserAgent(ua: string): boolean {
  return /android/i.test(ua);
}

export function isAppleMobileUserAgent(ua: string): boolean {
  return /iphone|ipad|ipod/i.test(ua);
}

export function storeUrlForUserAgent(ua: string): string | null {
  if (isAppleMobileUserAgent(ua)) {
    return env.IOS_APP_STORE_URL ?? null;
  }
  if (isAndroidUserAgent(ua)) {
    return env.ANDROID_PLAY_STORE_URL ?? null;
  }
  return null;
}

/**
 * Chrome Intent URL that opens the installed Barter app even when App Links
 * verification failed. `S.browser_fallback_url` is used only if the package
 * is missing.
 */
export function androidAppIntentUrl(path: string, fallbackUrl: string | null): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const extras = [
    "scheme=https",
    `package=${env.ANDROID_PACKAGE_ID}`,
  ];
  if (fallbackUrl) {
    extras.push(`S.browser_fallback_url=${encodeURIComponent(fallbackUrl)}`);
  }
  return `intent://www.bartersg.com${normalized}#Intent;${extras.join(";")};end`;
}

/** Helmet's production CSP blocks inline scripts; share pages need them to hand off. */
export const SHARE_PREVIEW_CSP = [
  "default-src 'none'",
  "img-src 'self' https: data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "base-uri 'none'",
].join("; ");
