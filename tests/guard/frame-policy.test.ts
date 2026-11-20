import { describe, expect, test } from "vitest";
import { allowsFraming } from "@/lib/studio/frame-policy";

describe("allowsFraming", () => {
  test("X-Frame-Options DENY or SAMEORIGIN blocks", () => {
    expect(allowsFraming("DENY", null)).toBe(false);
    expect(allowsFraming("SAMEORIGIN", null)).toBe(false);
    expect(allowsFraming("sameorigin", "")).toBe(false);
  });

  test("CSP frame-ancestors none / self / host list blocks, * allows", () => {
    expect(allowsFraming(null, "default-src 'self'; frame-ancestors 'none'")).toBe(false);
    expect(allowsFraming(null, "frame-ancestors 'self'")).toBe(false);
    expect(allowsFraming(null, "frame-ancestors https://www.achieve.com")).toBe(false);
    expect(allowsFraming(null, "default-src *; frame-ancestors *")).toBe(true);
  });

  test("no frame restriction allows embedding", () => {
    expect(allowsFraming(null, null)).toBe(true);
    expect(allowsFraming(null, "default-src 'self'")).toBe(true);
  });
});
