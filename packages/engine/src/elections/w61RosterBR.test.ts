import type { WorldState } from "../types.js";
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

// One world per file so vitest runs the three W61 roster sims in parallel
// workers (a single 3-world test took 17 minutes serially).
const seated = (w: WorldState, cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
const seats = (w: WorldState, cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;

describe("W61 roster: 1991 BR", () => {
  it("fills Camara and Senado per region and elects all five governors by t400", () => {
    const br = createWorld({ seed: "w61-br", playerName: "P", countryId: "BR", era: "1991" });
    for (let i = 0; i < 400; i++) advanceTurn(br);
    for (const key of ["chamber", "senate"]) expect(seated(br, "BR", key), `BR:${key}`).toBe(seats(br, "BR", key));
    expect(Object.values(br.governors).filter((g) => g.countryId === "BR" && g.governorId).length).toBe(5);
  });
});
