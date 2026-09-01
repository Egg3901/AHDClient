import { describe, expect, it } from "vitest";
import { createWorld } from "../world.js";
import { rngFromSeed } from "../rng.js";
import { bankingTurnPhase } from "./bankingTurn.js";
import type { BankLoan } from "./types.js";

const OPTS = { seed: "banking-turn-test", playerName: "P", countryId: "US", era: "1953" };
const RNG = rngFromSeed("banking-turn-rng");

function run(world: ReturnType<typeof createWorld>): void {
  bankingTurnPhase.run(world, RNG);
}

describe("bankingTurnPhase — NPC deposit flow", () => {
  it("grows npcDeposits toward the target share of externalBroadMoney over several turns", () => {
    const world = createWorld(OPTS);
    const bank = world.centralBanks["US"]!;
    bank.externalBroadMoney = 1_000_000;
    const corp = world.corporations["US-financial"]!;
    expect(corp.bankCharter!.npcDeposits).toBe(0);

    for (let i = 0; i < 40; i++) {
      world.meta.turn += 1;
      run(world);
    }
    expect(corp.bankCharter!.npcDeposits).toBeGreaterThan(0);
    // Never exceeds the deposit ceiling.
    expect(corp.bankCharter!.npcDeposits).toBeLessThanOrEqual(corp.bankCharter!.depositCeiling + 1e-6);
  });

  it("is idempotent within one turn (same meta.turn does not double-process)", () => {
    const world = createWorld(OPTS);
    world.centralBanks["US"]!.externalBroadMoney = 1_000_000;
    world.meta.turn = 1;
    run(world);
    const after1 = JSON.stringify(world.corporations["US-financial"]);
    run(world); // same turn again
    expect(JSON.stringify(world.corporations["US-financial"])).toBe(after1);
  });
});

describe("bankingTurnPhase — deposit interest paid by the bank (W5 PORT-STUB resolution)", () => {
  it("pays interest into player.savings when savingsHolder points at the bank", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.cashReserves = 100_000;
    world.player.savings = 10_000;
    world.player.savingsHolder = corp.id;
    world.meta.turn = 1;
    run(world);
    expect(world.player.savings).toBeGreaterThan(10_000);
  });

  it("does not touch player.savings when savingsHolder is centralBank (default)", () => {
    const world = createWorld(OPTS);
    world.player.savings = 10_000;
    world.player.savingsHolder = "centralBank";
    world.meta.turn = 1;
    run(world);
    expect(world.player.savings).toBe(10_000);
  });

  it("scales interest down proportionally when cashReserves cannot cover the full amount due", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    const bank = world.centralBanks["US"]!;
    corp.bankCharter!.npcDeposits = 1_000_000; // large NPC interest liability
    corp.bankCharter!.cashReserves = 1; // almost nothing to pay with
    bank.externalBroadMoney = 0; // no further NPC deposit inflow this turn
    world.player.savings = 10_000;
    world.player.savingsHolder = corp.id;
    world.meta.turn = 1;
    run(world);
    // Interest paid is capped by available cash; player still got a (small,
    // scaled) share rather than the full per-turn amount.
    const gained = world.player.savings - 10_000;
    expect(gained).toBeGreaterThanOrEqual(0);
    expect(gained).toBeLessThan(1); // cash reserves before payout were ~1
  });
});

describe("bankingTurnPhase — deposit insurance premium", () => {
  it("creates the country's insurance fund and collects a premium from bank cash", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.npcDeposits = 100_000;
    corp.bankCharter!.cashReserves = 100_000;
    world.meta.turn = 1;
    expect(world.depositInsurance["US"]).toBeUndefined();
    run(world);
    const fund = world.depositInsurance["US"];
    expect(fund).toBeDefined();
    expect(fund!.balance).toBeGreaterThan(0);
    expect(fund!.premiumsCollectedLifetime).toBe(fund!.balance);
  });
});

describe("bankingTurnPhase — NPC household bulk loan book", () => {
  it("originates loan tranches when the bank has cash-backed deposits above the reserve requirement", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.npcDeposits = 1_000_000;
    corp.bankCharter!.cashReserves = 1_000_000;
    world.meta.turn = 1;
    run(world);
    const tranches = world.bankLoans.filter((l) => l.bankCorpId === corp.id && l.borrowerType === "npcBulk");
    expect(tranches.length).toBeGreaterThan(0);
    for (const t of tranches) {
      expect(t.outstanding).toBeGreaterThan(0);
      expect(Number.isFinite(t.ratePercent)).toBe(true);
    }
    expect(corp.bankCharter!.totalLoans).toBeGreaterThan(0);
  });

  it("originates nothing when cash is already at/below the required reserve floor", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.npcDeposits = 1_000_000;
    // Cash already below the 20% floor for 1,000,000 in deposits (200,000) —
    // no headroom to lend into, and the deposit outflow this turn (EBM=0,
    // so the flow target is 0) only widens the shortfall further.
    corp.bankCharter!.cashReserves = 100_000;
    world.centralBanks["US"]!.externalBroadMoney = 0;
    world.meta.turn = 1;
    run(world);
    expect(corp.bankCharter!.totalLoans).toBe(0);
    expect(corp.bankCharter!.cashReserves).toBeGreaterThanOrEqual(0);
  });
});

describe("bankingTurnPhase — named loan servicing", () => {
  it("services a player loan: full payment reduces outstanding and pays the bank", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.cashReserves = 1000;
    corp.bankCharter!.totalLoans = 10_000;
    world.player.cash = 100_000;
    const loan: BankLoan = {
      id: "loan-1",
      bankCorpId: corp.id,
      borrowerType: "player",
      borrowerId: "player",
      principal: 10_000,
      outstanding: 10_000,
      ratePercent: 6,
      originatedTurn: 0,
      termTurns: 48,
      status: "current",
      arrearsTurns: 0,
      lastProcessedTurn: null,
    };
    world.bankLoans.push(loan);
    world.meta.turn = 1;
    const cashBefore = world.player.cash;
    run(world);
    expect(loan.outstanding).toBeLessThan(10_000);
    expect(loan.lastProcessedTurn).toBe(1);
    expect(world.player.cash).toBeLessThan(cashBefore);
    expect(corp.bankCharter!.cashReserves).toBeGreaterThan(1000);
  });

  it("defaults a loan after ARREARS_DEFAULT_TURNS consecutive shortfalls", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.cashReserves = 1000;
    corp.bankCharter!.totalLoans = 10_000;
    world.player.cash = 0; // borrower can never pay
    const loan: BankLoan = {
      id: "loan-default",
      bankCorpId: corp.id,
      borrowerType: "player",
      borrowerId: "player",
      principal: 10_000,
      outstanding: 10_000,
      ratePercent: 6,
      originatedTurn: 0,
      termTurns: 48,
      status: "current",
      arrearsTurns: 0,
      lastProcessedTurn: null,
    };
    world.bankLoans.push(loan);
    for (let i = 1; i <= 9; i++) {
      world.meta.turn = i;
      run(world);
    }
    expect(loan.status).toBe("defaulted");
  });
});

describe("bankingTurnPhase — conservation (no money created outside documented transfers)", () => {
  function totalCash(world: ReturnType<typeof createWorld>): number {
    let total = world.player.cash + world.player.savings;
    for (const corp of Object.values(world.corporations)) {
      total += corp.liquidCapital;
      if (corp.bankCharter) total += corp.bankCharter.cashReserves;
    }
    for (const bank of Object.values(world.centralBanks)) total += bank.externalBroadMoney;
    for (const fund of Object.values(world.depositInsurance)) total += fund.balance;
    return total;
  }

  it("total cash is conserved across the phase to within rounding tolerance", () => {
    const world = createWorld(OPTS);
    const corp = world.corporations["US-financial"]!;
    corp.bankCharter!.cashReserves = 500_000;
    corp.bankCharter!.npcDeposits = 800_000;
    world.centralBanks["US"]!.externalBroadMoney = 2_000_000;
    world.player.savings = 5000;
    world.player.savingsHolder = corp.id;
    world.player.cash = 20_000;

    const before = totalCash(world);
    for (let i = 1; i <= 20; i++) {
      world.meta.turn = i;
      run(world);
    }
    const after = totalCash(world);
    // Rounding to cents accumulates at most ~1 unit of drift per bank per turn.
    expect(Math.abs(after - before)).toBeLessThan(20 * 1);
  });
});

describe("bankingTurnPhase — determinism", () => {
  it("same seed and same mutations produce byte-identical results", () => {
    const a = createWorld(OPTS);
    const b = createWorld(OPTS);
    for (const world of [a, b]) {
      world.centralBanks["US"]!.externalBroadMoney = 500_000;
      world.corporations["US-financial"]!.bankCharter!.cashReserves = 50_000;
    }
    for (let i = 1; i <= 10; i++) {
      a.meta.turn = i;
      b.meta.turn = i;
      run(a);
      run(b);
    }
    expect(JSON.stringify(a.corporations)).toBe(JSON.stringify(b.corporations));
    expect(JSON.stringify(a.centralBanks)).toBe(JSON.stringify(b.centralBanks));
    expect(JSON.stringify(a.bankLoans)).toBe(JSON.stringify(b.bankLoans));
  });
});
