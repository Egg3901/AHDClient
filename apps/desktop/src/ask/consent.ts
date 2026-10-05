import type { AskProvider } from "./api.js";

// App Store guideline 5.1.2(i): name the outside AI services and get the
// player's permission before a question reaches them. Permission is tied to
// the exact list, so a provider added on the server asks again.

const CONSENT_KEY = "ahdclient.ask.aiConsent";

/** Used only when the Ask server predates the aiProviders field on /api/me. */
export const FALLBACK_PROVIDERS: AskProvider[] = [
  { name: "Meta", detail: "Muse Spark models. On Meta's contributor tier, Meta may use the question and answer to train its models" },
  { name: "Ollama", detail: "Ollama Cloud hosted models" },
  { name: "DeepSeek", detail: "DeepSeek models, operated from China" },
  { name: "Command Code", detail: "MiniMax models" },
  { name: "OpenRouter", detail: "relays to the vendor of the chosen model" },
  { name: "Google", detail: "Gemini models" },
];

export const ASK_PRIVACY_URL = "https://ask.lakesidegames.net/privacy";

export function consentSignature(providers: AskProvider[]): string {
  return providers
    .map((provider) => `${provider.name}|${provider.detail ?? ""}`)
    .sort()
    .join("\n");
}

export function hasAskConsent(providers: AskProvider[]): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === consentSignature(providers);
  } catch {
    return false;
  }
}

export function saveAskConsent(providers: AskProvider[]): void {
  try {
    localStorage.setItem(CONSENT_KEY, consentSignature(providers));
  } catch {
    // Private storage unavailable: permission lasts for this session only.
  }
}

export function clearAskConsent(): void {
  try {
    localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Nothing stored.
  }
}
