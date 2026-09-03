import type { WorldState } from "../types.js";
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

// One world per file so vitest runs the three W61 roster sims in parallel
// workers (a single 3-world test took 17 minutes serially).
const seated = (w: WorldState, cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
const seats = (w: WorldState, cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;

describe("W61 roster: 2019 IE", () => {
  it("fills Dail and local councils per region and elects an Uachtaran by t400", () => {
    const ie = createWorld({ seed: "w61-ie", playerName: "P", countryId: "IE", era: "2019" });
    for (let i = 0; i < 400; i++) advanceTurn(ie);
    for (const key of ["dail", "localCouncil"]) expect(seated(ie, "IE", key), `IE:${key}`).toBe(seats(ie, "IE", key));
    expect(ie.executives["IE"]?.presidentId, "IE uachtaran").toBeTruthy();
  });
});
