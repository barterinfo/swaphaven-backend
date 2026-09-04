import { describe, it, expect } from "vitest";
import { androidAppIntentUrl } from "../src/lib/share-preview.js";
import { env } from "../src/config/env.js";

describe("androidAppIntentUrl", () => {
  it("targets the https share host and package, with an encoded Play fallback", () => {
    const fallback =
      "https://play.google.com/store/apps/details?id=com.barter.app.barter_mobile&hl=en_SG";
    const url = androidAppIntentUrl("/listings/abc-123", fallback);

    expect(url.startsWith("intent://www.bartersg.com/listings/abc-123#Intent;")).toBe(true);
    expect(url).toContain("scheme=https");
    expect(url).toContain(`package=${env.ANDROID_PACKAGE_ID}`);
    expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(fallback)}`);
    expect(url.endsWith(";end")).toBe(true);
  });

  it("omits browser_fallback_url when no store URL is configured", () => {
    const url = androidAppIntentUrl("/users/user-1", null);
    expect(url).not.toContain("browser_fallback_url");
    expect(url).toContain("package=");
  });
});
