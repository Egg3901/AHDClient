export type ClientLanguage = "en" | "de";

const COPY = {
  en: {
    "settings.title": "Settings",
    "launcher.newGame": "New Game",
    "runtime.label": "Game runtime",
  },
  de: {
    "settings.title": "Einstellungen",
    "launcher.newGame": "Neues Spiel",
    "runtime.label": "Spielversion",
  },
} as const;

export type TranslationKey = keyof typeof COPY.en;

export function defaultLanguage(locales: readonly string[] = navigator.languages): ClientLanguage {
  return locales.some((locale) => locale.toLowerCase().startsWith("de")) ? "de" : "en";
}

export function translate(language: ClientLanguage, key: TranslationKey): string {
  return COPY[language][key];
}
