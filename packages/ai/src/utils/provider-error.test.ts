import { describe, expect, it } from "vitest";
import { formatProviderError } from "./provider-error.js";

describe("formatProviderError", () => {
  it.each([
    {
      name: "JSON body",
      error: Object.assign(new Error("403 status code (no body)"), {
        status: 403,
        error: { message: "blocked by gateway" },
      }),
      expected: '403: {"message":"blocked by gateway"}',
    },
    {
      name: "text body",
      error: Object.assign(new Error("502 status code (no body)"), {
        status: 502,
        body: "proxy unavailable",
      }),
      expected: "502: proxy unavailable",
    },
    {
      name: "no body",
      error: Object.assign(new Error("503 status code (no body)"), { status: 503 }),
      expected: "503 status code (no body)",
    },
  ])("formats an HTTP error with $name", ({ error, expected }) => {
    expect(formatProviderError(error)).toBe(expected);
  });

  it("preserves an SDK message that already contains the response body", () => {
    const body = '{"error":{"message":"permission denied"}}';
    const error = Object.assign(new Error(body), { status: 403, body });

    expect(formatProviderError(error)).toBe(body);
  });

  describe("Unicode truncation safety", () => {
    // 🦞 is U+1F99E = surrogate pair 🦞
    const LOBSTER = "🦞";

    it("excludes a surrogate pair cleanly when it straddles the 4000-character boundary", () => {
      // Place the lobster emoji such that its high surrogate is at index 3999
      // and its low surrogate at index 4000. truncateUtf16Safe must back the
      // boundary up to 3999 so no lone surrogate remains in the output.
      const prefix = "x".repeat(3999);
      const body = prefix + LOBSTER + "_trailing_after_boundary";

      const error = Object.assign(new Error("HTTP error"), {
        status: 500,
        body,
      });
      const result = formatProviderError(error);

      expect(result).toContain("... [truncated]");

      // The character immediately before the truncation marker must NOT be a
      // high surrogate — that would be a lone surrogate (mojibake).
      const markerIndex = result.indexOf("... [truncated]");
      const charBeforeTruncation = result.charCodeAt(markerIndex - 1);
      const isHighSurrogate = charBeforeTruncation >= 0xd800 && charBeforeTruncation <= 0xdbff;
      expect(isHighSurrogate).toBe(false);
    });

    it("preserves an emoji that falls entirely within the truncation limit", () => {
      // Position the emoji well inside the 4000-char limit: both surrogates
      // are at indices 3996–3997, so the boundary (4000) lands after it.
      const prefix = "x".repeat(3996);
      const body = prefix + LOBSTER + "trailing";
      expect(body.length).toBeGreaterThan(4000);

      const error = Object.assign(new Error("HTTP error"), {
        status: 500,
        body,
      });
      const result = formatProviderError(error);

      expect(result).toContain(LOBSTER);
      expect(result).toContain("... [truncated]");
    });

    it("does not truncate a body shorter than the limit", () => {
      const body = "short error " + LOBSTER;
      const error = Object.assign(new Error("HTTP error"), {
        status: 400,
        body,
      });

      const result = formatProviderError(error);
      expect(result).toContain(LOBSTER);
      expect(result).not.toContain("[truncated]");
    });
  });
});
