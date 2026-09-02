import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

// Split out of elections.test.ts (2026-09-02): vitest parallelizes across files,
// not within one, and these multi-hundred-turn sims were serializing the whole
// engine suite behind a single worker.
describe("1979 era fill (state layer + snap-type fix)", () => {
  it("1979 world: vacant chambers fill to capacity from per-region races (state layer + snap-type fix)", () => {
    // QA-sweep regression (2026-09-02): the 1979/1991/2019 packs shipped with no
    // US state layer, so no per-state House/Senate/governor race could spawn and
    // a 1979 US Congress stayed empty forever; and the soviets' Rotunda-native
    // snap type ("snap_sovietOfTheUnion") was unknown to the multi-seat gates,
    // so a vacant 559-seat chamber resolved as a single-winner race and seated 1.
    // Mainline's 1979-default deliberately starts legislatures vacant
    // (RESET_PRESETS description), so the invariant is "full after the first
    // cycles", not "seeded at t0".
    const w = createWorld({ seed: "qa-1979", playerName: "P", countryId: "US", era: "1979" });
    expect(Object.values(w.regions).filter((r) => r.countryId === "US").length).toBe(50);
    for (let i = 0; i < 400; i++) advanceTurn(w);
    const seated = (cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
    const seats = (cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;
    for (const [cid, key] of [["US", "house"], ["US", "senate"], ["US", "stateSenate"], ["UK", "regionalCouncil"], ["RU", "sovietOfTheUnion"], ["RU", "republicSupremeSoviet"], ["DD", "landAssembly"]] as const) {
      expect(seated(cid, key), `${cid}:${key}`).toBe(seats(cid, key));
    }
  });
});
