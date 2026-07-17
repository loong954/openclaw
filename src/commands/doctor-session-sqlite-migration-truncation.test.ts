import { truncateUtf16Safe } from "@openclaw/normalization-core/utf16-slice";
// Tests that truncateUtf16Safe is exercised for sanitized failure report text.
import { describe, expect, it } from "vitest";

describe("sanitize failure report truncation", () => {
  it("truncates text with emoji at 500-char boundary without breaking surrogates", () => {
    // Build a string of exactly 499 ASCII chars followed by an emoji.
    // truncateUtf16Safe at 500 should include the full emoji or exclude it,
    // never leave a broken surrogate at the boundary.
    const prefix = "x".repeat(499);
    const emoji = String.fromCharCode(0xd83d, 0xdc68); // 👨
    const text = prefix + emoji + "trailing";

    const result = truncateUtf16Safe(text, 500);

    // Result length should be either 499 (emoji excluded) or 501 (emoji included)
    // but NEVER 500 with a lone high surrogate.
    expect([499, 501]).toContain(result.length);

    // Verify no broken surrogates in result.
    let hasBroken = false;
    for (let i = 0; i < result.length; i++) {
      const code = result.charCodeAt(i);
      if (code >= 0xdc00 && code <= 0xdfff) {
        hasBroken = true;
        break;
      }
      if (code >= 0xd800 && code <= 0xdbff) {
        if (i + 1 >= result.length) {
          hasBroken = true;
          break;
        }
        const next = result.charCodeAt(i + 1);
        if (next < 0xdc00 || next > 0xdfff) {
          hasBroken = true;
          break;
        }
        i++;
      }
    }
    expect(hasBroken).toBe(false);
  });

  it("preserves full string when shorter than limit", () => {
    const text = "short text";
    expect(truncateUtf16Safe(text, 500)).toBe(text);
  });

  it("truncates plain ASCII at exact limit", () => {
    const text = "x".repeat(600);
    const result = truncateUtf16Safe(text, 500);
    expect(result.length).toBe(500);
  });

  it("handles empty string", () => {
    expect(truncateUtf16Safe("", 500)).toBe("");
  });

  it("handles emoji exactly at the boundary", () => {
    // 498 ASCII + emoji (2 UTF-16 units) = 500 total. truncateUtf16Safe should
    // return the full string (500 units) since the emoji fits.
    const text = "x".repeat(498) + String.fromCharCode(0xd83d, 0xdc68);
    expect(truncateUtf16Safe(text, 500)).toBe(text);
  });
});
