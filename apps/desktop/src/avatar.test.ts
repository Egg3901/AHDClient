import { describe, expect, it } from "vitest";
import { allowedAvatarUrl, initialsFor } from "./avatar.js";

describe("allowedAvatarUrl", () => {
  it("accepts the game, Discord and Blob hosts over https", () => {
    expect(allowedAvatarUrl("https://ahousedividedgame.com/avatars/a.png")).toBe(
      "https://ahousedividedgame.com/avatars/a.png",
    );
    expect(allowedAvatarUrl("https://cdn.ahousedividedgame.com/a.png")).toBe(
      "https://cdn.ahousedividedgame.com/a.png",
    );
    expect(allowedAvatarUrl("https://cdn.discordapp.com/avatars/1/a.png")).toBe(
      "https://cdn.discordapp.com/avatars/1/a.png",
    );
    expect(allowedAvatarUrl("https://abc123.public.blob.vercel-storage.com/a.png")).toBe(
      "https://abc123.public.blob.vercel-storage.com/a.png",
    );
  });

  it("rejects plain http, untrusted hosts, lookalikes and overlong URLs", () => {
    expect(allowedAvatarUrl("http://ahousedividedgame.com/a.png")).toBeNull();
    expect(allowedAvatarUrl("https://example.com/a.png")).toBeNull();
    expect(allowedAvatarUrl("https://ahousedividedgame.com.evil.com/a.png")).toBeNull();
    expect(allowedAvatarUrl("https://evilblob.vercel-storage.com/a.png")).toBeNull();
    expect(allowedAvatarUrl(`https://ahousedividedgame.com/${"a".repeat(2048)}`)).toBeNull();
  });

  it("rejects non-strings and relative paths", () => {
    expect(allowedAvatarUrl(null)).toBeNull();
    expect(allowedAvatarUrl(undefined)).toBeNull();
    expect(allowedAvatarUrl(42)).toBeNull();
    expect(allowedAvatarUrl("")).toBeNull();
    expect(allowedAvatarUrl("/avatars/a.png")).toBeNull();
    expect(allowedAvatarUrl("not a url")).toBeNull();
  });
});

describe("initialsFor", () => {
  it("takes up to two initials and falls back to A", () => {
    expect(initialsFor("Ada Lovelace")).toBe("AL");
    expect(initialsFor("Ada")).toBe("A");
    expect(initialsFor("")).toBe("A");
    expect(initialsFor(null)).toBe("A");
    expect(initialsFor(undefined)).toBe("A");
  });
});
