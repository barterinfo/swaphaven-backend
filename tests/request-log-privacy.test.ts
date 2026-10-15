import { describe, expect, it } from "vitest";
import { sanitizeRequestUrlForLogs } from "../src/lib/request-log-privacy.js";

describe("sanitizeRequestUrlForLogs", () => {
  it("redacts precise coordinates while preserving other query parameters", () => {
    const result = sanitizeRequestUrlForLogs(
      "/api/search/listings?q=camera&lat=1.3521&lng=103.8198&radius=5",
    );

    expect(result).toContain("/api/search/listings?");
    expect(result).toContain("q=camera");
    expect(result).toContain("radius=5");
    expect(result).not.toContain("1.3521");
    expect(result).not.toContain("103.8198");
  });

  it("redacts coordinate keys case-insensitively", () => {
    const result = sanitizeRequestUrlForLogs(
      "/nearby?Latitude=1.3&LONGITUDE=103.8",
    );

    expect(result).not.toContain("1.3");
    expect(result).not.toContain("103.8");
  });

  it("leaves requests without coordinates unchanged", () => {
    expect(sanitizeRequestUrlForLogs("/api/listings?q=vinyl&limit=20")).toBe(
      "/api/listings?q=vinyl&limit=20",
    );
  });
});
