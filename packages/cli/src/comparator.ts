export interface DiffEntry {
  path: string;
  a: unknown;
  b: unknown;
}

export interface CompareResult {
  equal: boolean;
  diffs: DiffEntry[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function deepCompare(a: unknown, b: unknown, maxDiffs = 20): CompareResult {
  const diffs: DiffEntry[] = [];
  compareRecursive(a, b, "", diffs, maxDiffs);
  return { equal: diffs.length === 0, diffs };
}

function compareRecursive(
  a: unknown,
  b: unknown,
  path: string,
  diffs: DiffEntry[],
  maxDiffs: number,
): void {
  if (diffs.length >= maxDiffs) return;

  if (a === b) return;

  // NaN !== NaN but should be considered equal for deep compare
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return;

  if (typeof a !== typeof b) {
    diffs.push({ path: path || "(root)", a, b });
    return;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      diffs.push({ path: path || "(root)", a: `array length ${a.length}`, b: `array length ${b.length}` });
      // still compare common indices for more detail
    }
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      compareRecursive(a[i], b[i], `${path}[${i}]`, diffs, maxDiffs);
      if (diffs.length >= maxDiffs) return;
    }
    if (a.length !== b.length) {
      // already reported; optionally report extra elements
      for (let i = len; i < Math.max(a.length, b.length); i++) {
        if (diffs.length >= maxDiffs) return;
        diffs.push({
          path: `${path}[${i}]`,
          a: i < a.length ? a[i] : "(missing)",
          b: i < b.length ? b[i] : "(missing)",
        });
      }
    }
    return;
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const sorted = [...keys].sort();
    for (const k of sorted) {
      const subPath = path ? `${path}.${k}` : k;
      if (!(k in a)) {
        diffs.push({ path: subPath, a: "(missing)", b: b[k] });
      } else if (!(k in b)) {
        diffs.push({ path: subPath, a: a[k], b: "(missing)" });
      } else {
        compareRecursive(a[k], b[k], subPath, diffs, maxDiffs);
      }
      if (diffs.length >= maxDiffs) return;
    }
    return;
  }

  // primitives or mismatched objects
  diffs.push({ path: path || "(root)", a, b });
}

export function formatDiffs(diffs: DiffEntry[]): string {
  if (diffs.length === 0) return "No differences.\n";
  const lines = diffs.map((d) => `  ${d.path}: ${JSON.stringify(d.a)} !== ${JSON.stringify(d.b)}`);
  return lines.join("\n") + "\n";
}
