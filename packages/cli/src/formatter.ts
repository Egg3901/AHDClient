import type { WorldState } from "@rotunda/engine";

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
