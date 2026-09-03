import { describe, expect, it } from "vitest";
import { filterSaveSlots, preferredSaveSlot, type SaveSlotMeta } from "./saves.js";

const SLOTS: SaveSlotMeta[] = [
  {
    slot: "quick-save",
    savedAt: "2026-09-02T12:00:00.000Z",
    turn: 44,
    date: "1953-11-10",
    era: "1953",
    country: "US",
    playerName: "Ada",
    cheatsUsed: false,
  },
  {
    slot: "sandbox",
    savedAt: "2026-09-01T12:00:00.000Z",
    turn: 120,
    date: "2021-04-20",
    era: "2019",
    country: "UK",
    playerName: "Grace",
    cheatsUsed: true,
  },
];

describe("save slot selection", () => {
  it("keeps the current selection when it still exists", () => {
    expect(preferredSaveSlot(SLOTS, "sandbox")).toBe("sandbox");
  });

  it("selects the newest slot when the selection is empty or stale", () => {
    expect(preferredSaveSlot(SLOTS, null)).toBe("quick-save");
    expect(preferredSaveSlot(SLOTS, "deleted-slot")).toBe("quick-save");
    expect(preferredSaveSlot([], "deleted-slot")).toBeNull();
  });
});

describe("save slot filtering", () => {
  it("matches names, world metadata, turns, and cheat status", () => {
    expect(filterSaveSlots(SLOTS, "Grace")).toEqual([SLOTS[1]]);
    expect(filterSaveSlots(SLOTS, "uk")).toEqual([SLOTS[1]]);
    expect(filterSaveSlots(SLOTS, "turn 120")).toEqual([SLOTS[1]]);
    expect(filterSaveSlots(SLOTS, "t44")).toEqual([SLOTS[0]]);
    expect(filterSaveSlots(SLOTS, "cheats")).toEqual([SLOTS[1]]);
  });

  it("returns all slots for a blank query and none for a miss", () => {
    expect(filterSaveSlots(SLOTS, "   ")).toBe(SLOTS);
    expect(filterSaveSlots(SLOTS, "missing")).toEqual([]);
  });
});
