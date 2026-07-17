// OpenRouter video-http URL validation tests
import { describe, expect, it } from "vitest";
import { resolveOpenRouterVideoUrl } from "./video-http.js";

describe("resolveOpenRouterVideoUrl", () => {
  it("resolves a valid relative video URL against the base URL", () => {
    const result = resolveOpenRouterVideoUrl(
      "/v1/video/download/abc123",
      "https://api.openrouter.ai",
    );
    expect(result).toBe("https://api.openrouter.ai/v1/video/download/abc123");
  });

  it("resolves an absolute video URL unchanged when base matches", () => {
    const result = resolveOpenRouterVideoUrl(
      "https://api.openrouter.ai/v1/video/download/abc123",
      "https://api.openrouter.ai",
    );
    expect(result).toBe("https://api.openrouter.ai/v1/video/download/abc123");
  });

  it("throws descriptive error for malformed URL with the URL value included", () => {
    expect(() => resolveOpenRouterVideoUrl("http://%zz/", "https://api.openrouter.ai")).toThrow(
      /Invalid.*URL/,
    );
  });

  it("throws descriptive error for malformed base URL", () => {
    expect(() => resolveOpenRouterVideoUrl("/v1/video/download", "http://[invalid]/")).toThrow(
      /Invalid.*URL/,
    );
  });
});
