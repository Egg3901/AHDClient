// Explicit ISO numeric (world-atlas) -> ROTUNDA uppercase country id mapping for the 27.
// Built for 1953 and 1960 packs (27 countries). Covers modern border handling:
// - DE geometry (276) maps to DE only; DD has no separate polygon (unified Germany).
//   Tint unified Germany by DE economy; badge DD in side panel (rectangle-free).
// - CS (Czechoslovakia) maps to both 203 Czechia and 703 Slovakia.
// - BAL (Baltic Republics) maps to 233 Estonia, 428 Latvia, 440 Lithuania.
// - YU (Yugoslavia) maps to its six successor states on 110m: Bosnia, Croatia, Montenegro, Serbia, Macedonia, Slovenia.
// - BLR, UKR have direct geometries. RU (643) is modern Russia only.
// Non-listed ISO codes (e.g., Antarctica 010) remain neutral gray.
export const ISO_TO_COUNTRY: Record<string, string> = {
  "840": "US",
  "826": "UK",
  "643": "RU",
  "250": "FR",
  "380": "IT",
  "724": "ES",
  "752": "SE",
  "792": "TR",
  "300": "GR",
  "040": "AT",
  "246": "FI",
  "276": "DE",
  "392": "JP",
  "156": "CN",
  "076": "BR",
  "372": "IE",
  "566": "NG",
  "348": "HU",
  "616": "PL",
  "642": "RO",
  "100": "BG",
  "112": "BLR",
  "804": "UKR",
  // Czechoslovakia on modern map
  "203": "CS",
  "703": "CS",
  // Baltic Republics
  "233": "BAL",
  "428": "BAL",
  "440": "BAL",
  // Yugoslavia successor states
  "070": "YU",
  "191": "YU",
  "499": "YU",
  "688": "YU",
  "807": "YU",
  "705": "YU",
  // DD intentionally absent: 110m has unified Germany only (276). Handled separately.
};

// Reverse: country -> ISO list (for selection highlight logic if needed)
export const COUNTRY_TO_ISOS: Record<string, string[]> = (() => {
  const m: Record<string, string[]> = {};
  for (const [iso, country] of Object.entries(ISO_TO_COUNTRY)) {
    if (!m[country]) m[country] = [];
    m[country]!.push(iso);
  }
  return m;
})();

// All 27 country ids for reference / legend
export const ALL_COUNTRY_IDS = [
  "US","UK","RU","FR","IT","ES","SE","TR","GR","AT","FI","DE","JP","CN","BR","IE","NG","DD","HU","PL","RO","YU","BG","BLR","UKR","CS","BAL",
] as const;
