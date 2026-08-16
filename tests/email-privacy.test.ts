import { describe, it, expect } from "vitest";
import {
  decryptEmail,
  encryptEmail,
  hashEmail,
  maskEmail,
  normalizeEmail,
  sealEmail,
} from "../src/lib/email-privacy.js";

describe("email-privacy", () => {
  it("normalises case and whitespace", () => {
    expect(normalizeEmail("  Pranam@Gmail.COM ")).toBe("pranam@gmail.com");
  });

  it("hashes the same email to the same value", () => {
    expect(hashEmail("pranam@gmail.com")).toBe(hashEmail("PRANAM@Gmail.COM"));
  });

  it("hashes different emails to different values", () => {
    expect(hashEmail("pranam@gmail.com")).not.toBe(hashEmail("prayag@gmail.com"));
  });

  it("masks first and last local-part characters", () => {
    expect(maskEmail("pranam@gmail.com")).toBe("p***m@gmail.com");
    expect(maskEmail("prayag@gmail.com")).toBe("p***g@gmail.com");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });

  it("round-trips encrypt/decrypt", () => {
    const email = "pranam@gmail.com";
    expect(decryptEmail(encryptEmail(email))).toBe(email);
  });

  it("sealEmail never includes plaintext", () => {
    const sealed = sealEmail("pranam@gmail.com");
    expect(sealed.emailHash).toBe(hashEmail("pranam@gmail.com"));
    expect(sealed.emailMasked).toBe("p***m@gmail.com");
    expect(Object.values(sealed).join(" ")).not.toContain("pranam@gmail.com");
    expect(decryptEmail(sealed.emailCiphertext)).toBe("pranam@gmail.com");
  });
});
