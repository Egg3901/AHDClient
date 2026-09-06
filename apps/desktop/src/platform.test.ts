import { describe, expect, it } from "vitest";
import { detectPlatform } from "./platform.js";

describe("detectPlatform", () => {
  it("recognises the Android system webview", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36 AHDClient-Mobile/2.0.6",
      ),
    ).toBe("android");
  });

  it("recognises WebKit on iPhone and iPad", () => {
    expect(
      detectPlatform(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 AHDClient-Mobile/2.0.6",
      ),
    ).toBe("ios");
    expect(
      detectPlatform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("ios");
  });

  it("treats every desktop webview as desktop", () => {
    for (const agent of [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "",
    ]) {
      expect(detectPlatform(agent)).toBe("desktop");
    }
  });
});
