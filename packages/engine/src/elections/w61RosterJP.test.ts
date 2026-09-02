import type { WorldState } from "../types.js";
import { describe, expect, it } from "vitest";
import { advanceTurn } from "../engine.js";
import { createWorld } from "../world.js";

// One world per file so vitest runs the three W61 roster sims in parallel
// workers (a single 3-world test took 17 minutes serially).
const seated = (w: WorldState, cid: string, key: string) => w.politicians.filter((p) => p.countryId === cid && p.chamberKey === key).length;
const seats = (w: WorldState, cid: string, key: string) => w.legislatures[cid]!.chambers.find((c) => c.key === key)!.seats;

describe("W61 roster: 2019 JP", () => {
  it("fills Shugiin, Sangiin (two classes) and regional councils per region and forms a government by t400", () => {
    const jp = createWorld({ seed: "w61-jp", playerName: "P", countryId: "JP", era: "2019" });
    for (let i = 0; i < 400; i++) advanceTurn(jp);
    for (const key of ["shugiin", "sangiin", "regionalCouncil"]) expect(seated(jp, "JP", key), `JP:${key}`).toBe(seats(jp, "JP", key));
    expect(jp.governments["JP"]?.status).toBe("formed");
  });
});
