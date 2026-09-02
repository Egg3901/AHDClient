/**
 * International org seeding for a fresh 1953 world. Only orgs that
 * historically exist by the 1953 start date are seeded — WARSAW_PACT (1955)
 * and the Non-Aligned Movement (1961) do not exist yet and are correctly
 * absent, not merely unseeded (B16 continuation: era-crossing org founding
 * — e.g. seeding WARSAW_PACT if a world crosses into 1955+ — is PORT-STUB,
 * no era-crossing hook exists for international orgs).
 *
 * Membership is restricted to country ids present in the calling pack (so a
 * smaller/experimental pack never seeds a dangling member id), and further
 * restricted to real historical founding members present in that set — no
 * invented rosters. UN: San Francisco 1945 founding members present in the
 * 1953 pack (US, UK, RU as the USSR seat, FR, BR, TR, GR). NATO: founded
 * 1949; TR and GR acceded 1952, so both are members by the 1953 start.
 * DD (East Germany) is correctly absent from both — not a UN member until
 * 1973, and the Warsaw Pact it would join doesn't exist yet either.
 */
import type { InternationalOrgState } from "./types.js";

const UN_FOUNDING_MEMBERS = ["US", "UK", "RU", "FR", "BR", "TR", "GR"];
const NATO_1953_MEMBERS = ["US", "UK", "FR", "IT", "TR", "GR"];

export function seedInternationalOrgs(countryIds: readonly string[]): Record<string, InternationalOrgState> {
  const known = new Set(countryIds);
  const orgs: Record<string, InternationalOrgState> = {};
  orgs["UN"] = { id: "UN", name: "United Nations", foundedYear: 1945, members: UN_FOUNDING_MEMBERS.filter((c) => known.has(c)) };
  orgs["NATO"] = { id: "NATO", name: "North Atlantic Treaty Organization", foundedYear: 1949, members: NATO_1953_MEMBERS.filter((c) => known.has(c)) };
  return orgs;
}
