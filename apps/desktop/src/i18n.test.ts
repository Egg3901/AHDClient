import { describe, expect, it } from "vitest";
import { defaultLanguage, translate } from "./i18n.js";

describe("client language", () => {
  it("follows German operating-system locales and falls back to English", () => {
    expect(defaultLanguage(["de-DE"])).toBe("de");
    expect(defaultLanguage(["de-CH", "en"])).toBe("de");
    expect(defaultLanguage(["fr-FR"])).toBe("en");
  });

  it("has German client-shell copy", () => {
    expect(translate("de", "settings.title")).toBe("Einstellungen");
    expect(translate("de", "launcher.newGame")).toBe("Neues Spiel");
    expect(translate("de", "runtime.label")).toBe("Spielversion");
  });
});
