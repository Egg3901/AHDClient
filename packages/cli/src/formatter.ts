import type { WorldState, InvariantReport } from "@rotunda/engine";
import type { QaCountryResult } from "./qa.js";

export interface ProgressRow {
  turn: number;
  date: string;
  era: string;
  gdp: number;
  growthRate: number;
  inflationRate: number;
  unemploymentRate: number;
  outputGap: number;
}

function padEnd(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + " ".repeat(width - s.length);
}

function padStart(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return " ".repeat(width - s.length) + s;
}

function formatNumber(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return String(n);
  return n.toFixed(decimals);
}

export function formatProgressTable(rows: ProgressRow[]): string {
  if (rows.length === 0) return "(no turns)\n";
  const headers = ["Turn", "Date", "Era", "GDP", "Growth%", "Infl%", "Unemp%", "Gap"];
  const widths = [6, 12, 6, 10, 9, 9, 9, 7];
  const lines: string[] = [];
  const headerLine = headers.map((h, i) => padEnd(h, widths[i]!)).join(" | ");
  lines.push(headerLine);
  lines.push("-".repeat(headerLine.length));
  for (const r of rows) {
    const cells = [
      padStart(String(r.turn), widths[0]!),
      padEnd(r.date, widths[1]!),
      padEnd(r.era, widths[2]!),
      padStart(formatNumber(r.gdp, 0), widths[3]!),
      padStart(formatNumber(r.growthRate * 100, 2), widths[4]!),
      padStart(formatNumber(r.inflationRate * 100, 2), widths[5]!),
      padStart(formatNumber(r.unemploymentRate * 100, 2), widths[6]!),
      padStart(formatNumber(r.outputGap, 2), widths[7]!),
    ];
    lines.push(cells.join(" | "));
  }
  return lines.join("\n") + "\n";
}

export function formatSummaryTable(world: WorldState): string {
  const headers = ["Country", "GDP", "Growth%", "Infl%", "Unemp%", "Gap"];
  const widths = [10, 12, 9, 9, 9, 7];
  const lines: string[] = [];
  const headerLine = headers.map((h, i) => padEnd(h, widths[i]!)).join(" | ");
  lines.push(headerLine);
  lines.push("-".repeat(headerLine.length));
  const ids = Object.keys(world.countries).sort();
  for (const id of ids) {
    const c = world.countries[id]!;
    const e = c.economy;
    const cells = [
      padEnd(id, widths[0]!),
      padStart(formatNumber(e.gdp, 0), widths[1]!),
      padStart(formatNumber(e.growthRate * 100, 2), widths[2]!),
      padStart(formatNumber(e.inflationRate * 100, 2), widths[3]!),
      padStart(formatNumber(e.unemploymentRate * 100, 2), widths[4]!),
      padStart(formatNumber(e.outputGap, 2), widths[5]!),
    ];
    lines.push(cells.join(" | "));
  }
  return lines.join("\n") + "\n";
}

/** W41: formats an InvariantReport (history/invariants.ts checkInvariants) for the `invariants` CLI command. */
export function formatInvariantReport(report: InvariantReport): string {
  const lines: string[] = [];
  lines.push(`Turn ${report.turn}: ${report.checksRun} checks run, status ${report.status.toUpperCase()}`);
  if (report.findings.length === 0) {
    lines.push("No violations found.");
    return lines.join("\n") + "\n";
  }
  const headers = ["Severity", "Check", "Message"];
  const widths = [9, 24, 80];
  const headerLine = headers.map((h, i) => padEnd(h, widths[i]!)).join(" | ");
  lines.push(headerLine);
  lines.push("-".repeat(headerLine.length));
  for (const f of report.findings) {
    lines.push([padEnd(f.severity.toUpperCase(), widths[0]!), padEnd(f.check, widths[1]!), padEnd(f.message, widths[2]!)].join(" | "));
  }
  return lines.join("\n") + "\n";
}

/** W42 QA gate: one-line-per-country summary table plus a violation detail dump. */
export function formatQaReport(results: QaCountryResult[]): string {
  const lines: string[] = [];
  const headers = ["Era", "Country", "Turns", "Determ", "Invar", "EconBand", "Seats", "Elect", "Gov", "PolPop", "Treasury", "OK"];
  const widths = [6, 9, 6, 6, 5, 8, 5, 5, 12, 6, 8, 4];
  const headerLine = headers.map((h, i) => padEnd(h, widths[i]!)).join(" | ");
  lines.push(headerLine);
  lines.push("-".repeat(headerLine.length));
  for (const r of results) {
    const govCell = !r.governmentApplicable
      ? "n/a"
      : r.governmentStuckPending
        ? "STUCK"
        : r.governmentFormed
          ? "formed"
          : "pending";
    const cells = [
      padEnd(r.era, widths[0]!),
      padEnd(r.countryId, widths[1]!),
      padStart(String(r.turns), widths[2]!),
      padEnd(r.determinismOk ? "ok" : "FAIL", widths[3]!),
      padEnd(r.invariantOk ? "ok" : "FAIL", widths[4]!),
      padEnd(r.economyBandViolations.length === 0 ? "ok" : "FAIL", widths[5]!),
      padEnd(r.seatSumViolations.length === 0 ? "ok" : "FAIL", widths[6]!),
      padEnd(r.electionsOk ? "ok" : "FAIL", widths[7]!),
      padEnd(govCell, widths[8]!),
      padEnd(r.politicianPopulationOk ? "ok" : "FAIL", widths[9]!),
      padEnd(r.treasuryBoundsOk ? "ok" : "FAIL", widths[10]!),
      padEnd(r.ok ? "OK" : "FAIL", widths[11]!),
    ];
    lines.push(cells.join(" | "));
  }
  lines.push("");

  const failing = results.filter((r) => !r.ok);
  if (failing.length === 0) {
    lines.push(`All ${results.length} era/country combinations passed.`);
    return lines.join("\n") + "\n";
  }

  lines.push(`${failing.length} of ${results.length} era/country combinations FAILED. Detail:`);
  for (const r of failing) {
    lines.push("");
    lines.push(`== ${r.era} ${r.countryId} (seed ${r.seed}, ${r.turns} turns) ==`);
    if (!r.determinismOk) {
      lines.push(`  determinism: ${r.determinismDiffCount} diffs between twin runs (same seed)`);
    }
    if (!r.invariantOk) {
      for (const rep of r.invariantReports) {
        if (rep.status === "red") {
          lines.push(`  invariants @turn ${rep.turn}: status ${rep.status}`);
          for (const f of rep.findings) lines.push(`    [${f.severity}] ${f.check}: ${f.message}`);
        }
      }
    }
    for (const v of r.economyBandViolations) {
      lines.push(`  economy band @turn ${v.turn}: ${v.metric}=${v.value} outside [${v.min}, ${v.max}]`);
    }
    for (const v of r.seatSumViolations) {
      lines.push(
        `  seat sum @turn ${v.turn}: chamber ${v.chamberKey} seatsByParty(${v.seatsByPartySum}) + vacancies(${v.vacancies}) != chamber.seats(${v.expectedSeats})`,
      );
    }
    if (!r.electionsOk) {
      lines.push(`  elections: ${r.electionsResolved} elections resolved (${r.electionsSeen} seen) for ${r.countryId} over ${r.turns} turns`);
    }
    if (r.governmentApplicable && !r.governmentFormed) {
      lines.push(
        r.governmentStuckPending
          ? "  government: stuck pending past pmVacancyDeadlineTurn"
          : "  government: not formed",
      );
    }
    if (!r.politicianPopulationOk) {
      lines.push(
        `  politician population: ${r.politicianCountFinal} final vs ${r.politicianCountInitial} initial (outside [0.25x, 4x] band)`,
      );
    }
    if (!r.treasuryBoundsOk) {
      lines.push(`  treasury: treasuryBalance=${r.treasuryBalanceFinal} outside sanity ceiling`);
    }
  }
  return lines.join("\n") + "\n";
}

export function buildProgressRows(
  world: WorldState,
  countryId: string,
  checkpoints: { turn: number; date: string; era: string }[],
): ProgressRow[] {
  return checkpoints.map((cp) => {
    const econ = world.countries[countryId]?.economy;
    if (!econ) throw new Error(`Country ${countryId} not found`);
    return {
      turn: cp.turn,
      date: cp.date,
      era: cp.era,
      gdp: econ.gdp,
      growthRate: econ.growthRate,
      inflationRate: econ.inflationRate,
      unemploymentRate: econ.unemploymentRate,
      outputGap: econ.outputGap,
    };
  });
}
