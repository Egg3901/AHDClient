#!/usr/bin/env tsx
import { advanceTurn, createWorld, listEras, checkInvariants } from "@rotunda/engine";
import type { WorldState } from "@rotunda/engine";
import { formatProgressTable, formatSummaryTable, formatInvariantReport } from "./formatter.js";
import type { ProgressRow } from "./formatter.js";
import { deepCompare, formatDiffs } from "./comparator.js";

function printUsage(): void {
  console.log(`Usage:
  sim run --era <era> --country <id> --seed <seed> --turns <n> [--json]
  sim determinism --turns <n> [--seed <seed>]
  sim bench --turns <n> [--era <era> --country <id> --seed <seed>]
  sim invariants --era <era> --country <id> --seed <seed> --turns <n> [--json]

Commands:
  run           Create a world and advance N turns
  determinism   Two independent runs per era with same seed, deep-compare final JSON
  bench         Benchmark turns/sec and mean per-phase timings
  invariants    Create a world, advance N turns, and run the W41 invariant checks
                (history/invariants.ts checkInvariants — the solo port of
                mainline's ledgerReconcile). Exits 1 if status is not green.

Options:
  --era <id>      Era id from listEras() (e.g. 1953). Required for run/invariants.
  --country <id>  Country id uppercase (e.g. US). Required for run/invariants.
  --seed <s>      RNG seed string. Required for run/invariants.
  --turns <n>     Number of turns to advance (integer >= 0).
  --json          For run/invariants: output full JSON instead of tables.
`);
}

function parseArgs(argv: string[]): { cmd: string; opts: Record<string, string | boolean> } {
  const args = argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { cmd: "help", opts: {} };
  }
  const cmd = args[0]!;
  const opts: Record<string, string | boolean> = {};
  let i = 1;
  while (i < args.length) {
    const a = args[i]!;
    if (a === "--json") {
      opts["json"] = true;
      i++;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = args[i + 1];
      if (val === undefined || val.startsWith("--")) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      opts[key] = val;
      i += 2;
    } else {
      console.error(`Unexpected argument: ${a}`);
      process.exit(1);
    }
  }
  return { cmd, opts };
}

function requireOpt(opts: Record<string, string | boolean>, key: string): string {
  const v = opts[key];
  if (typeof v !== "string" || v.length === 0) {
    console.error(`Missing required --${key}`);
    printUsage();
    process.exit(1);
  }
  return v;
}

function parseTurns(raw: string | boolean | undefined): number {
  if (typeof raw !== "string") {
    console.error("Missing required --turns <n>");
    process.exit(1);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--turns must be an integer >= 0, got ${String(raw)}`);
    process.exit(1);
  }
  return n;
}

function validateCountryId(id: string): void {
  if (id !== id.toUpperCase()) {
    console.error(`Country id must be uppercase, got ${id}`);
    process.exit(1);
  }
}

function validateEra(era: string): void {
  const eras = listEras().map((e) => e.id);
  if (!eras.includes(era)) {
    console.error(`Unknown era: ${era}. Available: ${eras.join(", ")}`);
    process.exit(1);
  }
}

function runWorld(era: string, countryId: string, seed: string, turns: number): WorldState {
  const world = createWorld({ era, countryId, seed, playerName: "SimPlayer" });
  for (let i = 0; i < turns; i++) {
    advanceTurn(world);
  }
  return world;
}

async function commandRun(opts: Record<string, string | boolean>): Promise<void> {
  const era = requireOpt(opts, "era");
  const countryId = requireOpt(opts, "country");
  const seed = requireOpt(opts, "seed");
  const turns = parseTurns(opts["turns"]);
  const json = opts["json"] === true;

  validateCountryId(countryId);
  validateEra(era);

  let world: WorldState;
  try {
    world = createWorld({ era, countryId, seed, playerName: "SimPlayer" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }

  // Collect progress snapshots
  const snapshots: { turn: number; date: string; era: string; econ: WorldState["countries"][string]["economy"] }[] = [];
  // snapshot at turn 0
  const initialEcon = world.countries[countryId]!.economy;
  snapshots.push({ turn: world.meta.turn, date: world.meta.date, era: world.meta.era, econ: { ...initialEcon } });

  for (let i = 0; i < turns; i++) {
    advanceTurn(world);
    if ((i + 1) % 52 === 0 || i + 1 === turns) {
      const econ = world.countries[countryId]!.economy;
      // avoid duplicating final if turns is multiple of 52 (still only one entry)
      const last = snapshots[snapshots.length - 1];
      if (last && last.turn === world.meta.turn) {
        // update last
        last.date = world.meta.date;
        last.era = world.meta.era;
        last.econ = { ...econ };
      } else {
        snapshots.push({ turn: world.meta.turn, date: world.meta.date, era: world.meta.era, econ: { ...econ } });
      }
    }
  }
  // If turns=0, we already have snapshot. If turns not multiple of 52 and >0, final snapshot already added.
  // If turns is 0, progress table has 1 row. If we want to avoid duplicate for non-multiples, fine.
  // But we pushed final already via condition i+1===turns, so no need to add again.

  if (json) {
    console.log(JSON.stringify(world, null, 2));
    return;
  }

  const progressRows: ProgressRow[] = snapshots.map((s) => ({
    turn: s.turn,
    date: s.date,
    era: s.era,
    gdp: s.econ.gdp,
    growthRate: s.econ.growthRate,
    inflationRate: s.econ.inflationRate,
    unemploymentRate: s.econ.unemploymentRate,
    outputGap: s.econ.outputGap,
  }));

  console.log(formatProgressTable(progressRows));
  console.log(`Final summary after ${turns} turns (era ${world.meta.era}, date ${world.meta.date}):`);
  console.log(formatSummaryTable(world));
}

async function commandDeterminism(opts: Record<string, string | boolean>): Promise<void> {
  const turns = parseTurns(opts["turns"]);
  const seed = typeof opts["seed"] === "string" && opts["seed"].length > 0 ? opts["seed"] : "determinism-seed";

  const eras = listEras();
  if (eras.length === 0) {
    console.error("No shipped eras found");
    process.exit(1);
  }

  let failed = false;
  for (const era of eras) {
    // pick first playable country as canonical; prefer US if available
    let countryId = "US";
    try {
      const { listPlayableCountries } = await import("@rotunda/engine");
      const playable = listPlayableCountries(era.id);
      if (!playable.some((c) => c.id === countryId)) {
        countryId = playable[0]!.id;
      }
    } catch {
      // fallback
      countryId = "US";
    }

    const a = runWorld(era.id, countryId, seed, turns);
    const b = runWorld(era.id, countryId, seed, turns);

    const result = deepCompare(a, b);
    if (!result.equal) {
      failed = true;
      console.error(`Determinism mismatch for era ${era.id} (country ${countryId}, seed ${seed}, turns ${turns}):`);
      console.error(formatDiffs(result.diffs));
    } else {
      console.log(`OK era ${era.id} country ${countryId} turns ${turns}`);
    }
  }

  if (failed) {
    console.error("Determinism check FAILED");
    process.exit(1);
  } else {
    console.log("Determinism check passed");
  }
}

async function commandBench(opts: Record<string, string | boolean>): Promise<void> {
  const turns = parseTurns(opts["turns"]);
  const eras = listEras();
  const defaultEra = eras[0]?.id ?? "1953";
  const era = typeof opts["era"] === "string" && opts["era"].length > 0 ? opts["era"] as string : defaultEra;
  const countryId = typeof opts["country"] === "string" && opts["country"].length > 0 ? (opts["country"] as string) : "US";
  const seed = typeof opts["seed"] === "string" && opts["seed"].length > 0 ? (opts["seed"] as string) : "bench-seed";

  validateCountryId(countryId);
  validateEra(era);

  let world: WorldState;
  try {
    world = createWorld({ era, countryId, seed, playerName: "SimPlayer" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }

  const timings: Map<string, number[]> = new Map();
  const start = performance.now();
  for (let i = 0; i < turns; i++) {
    const report = advanceTurn(world);
    for (const pt of report.phaseTimings) {
      let arr = timings.get(pt.name);
      if (!arr) {
        arr = [];
        timings.set(pt.name, arr);
      }
      arr.push(pt.ms);
    }
  }
  const elapsedMs = performance.now() - start;
  const elapsedSec = elapsedMs / 1000;
  const turnsPerSec = elapsedSec > 0 ? turns / elapsedSec : 0;

  console.log(`Bench: ${turns} turns in ${elapsedMs.toFixed(1)} ms (${turnsPerSec.toFixed(1)} turns/sec)`);
  console.log("Mean per-phase milliseconds:");
  for (const [name, arr] of timings) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    console.log(`  ${name}: ${mean.toFixed(4)} ms`);
  }
}

async function commandInvariants(opts: Record<string, string | boolean>): Promise<void> {
  const era = requireOpt(opts, "era");
  const countryId = requireOpt(opts, "country");
  const seed = requireOpt(opts, "seed");
  const turns = parseTurns(opts["turns"]);
  const json = opts["json"] === true;

  validateCountryId(countryId);
  validateEra(era);

  let world: WorldState;
  try {
    world = createWorld({ era, countryId, seed, playerName: "SimPlayer" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }

  for (let i = 0; i < turns; i++) {
    advanceTurn(world);
  }

  const report = checkInvariants(world);

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatInvariantReport(report));
  }

  if (report.status !== "green") {
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { cmd, opts } = parseArgs(process.argv);
  if (cmd === "help") {
    printUsage();
    process.exit(0);
  }
  switch (cmd) {
    case "run":
      await commandRun(opts);
      break;
    case "determinism":
      await commandDeterminism(opts);
      break;
    case "bench":
      await commandBench(opts);
      break;
    case "invariants":
      await commandInvariants(opts);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
